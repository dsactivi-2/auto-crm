/**
 * popup-handler.ts
 * Behandelt JavaScript-Dialoge (alert/confirm/prompt) und HTML-<dialog>-Elemente
 * im CRM crm.job-step.com via Chrome DevTools Protocol (CDP).
 *
 * Kein Playwright, kein Stagehand — reines CDP über cdpSession.
 */

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

/** Mögliche Aktionen bei einem Dialog */
export type DialogAction = 'accept' | 'dismiss';

/** CDP-Dialogtypen gemäß Page.javascriptDialogOpening */
export type DialogType = 'alert' | 'confirm' | 'prompt' | 'beforeunload';

/** Eintrag im Dialog-Log */
export interface DialogEvent {
  timestamp: Date;
  type: DialogType | 'html-dialog';
  message: string;
  action: DialogAction;
  promptText?: string; // Nur bei prompt-Dialogen: der gesendete Text
  ruleMatched?: string; // Regex-Pattern der gematchten Regel (zur Diagnose)
}

/** Konfigurierbare Regel: Wenn message.match(pattern) → action ausführen */
export interface DialogRule {
  pattern: RegExp;
  action: DialogAction;
  /** Optionaler Text für prompt-Dialoge (wird als Eingabe gesendet) */
  promptText?: string;
}

/** Minimales Interface des CDP-Sessions (kompatibel mit chrome-remote-interface & MCP) */
export interface CdpSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(event: string, listener: (params: unknown) => void): void;
  off?(event: string, listener: (params: unknown) => void): void;
}

/** Interne CDP-Event-Payload für Page.javascriptDialogOpening */
interface JavaScriptDialogOpeningPayload {
  url: string;
  message: string;
  type: DialogType;
  hasBrowserHandler: boolean;
  defaultPrompt?: string;
}

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

/**
 * Standard-Regeln, die für das CRM crm.job-step.com sinnvoll sind.
 * Reihenfolge ist entscheidend — erste Übereinstimmung gewinnt.
 */
const DEFAULT_RULES: DialogRule[] = [
  // Typische Lösch-Bestätigungen → ablehnen (sicherer Default)
  {
    pattern: /löschen|delete|entfernen|remove/i,
    action: 'dismiss',
  },
  // Speichern / OK-Dialoge → akzeptieren
  {
    pattern: /speichern|save|gespeichert|saved|erfolgreich|success|ok\b/i,
    action: 'accept',
  },
  // Abbrechen-Hinweise → ablehnen
  {
    pattern: /abbrechen|cancel|verwerfen|discard/i,
    action: 'dismiss',
  },
  // Session-Timeout → akzeptieren (Session-Verlängerung bestätigen)
  {
    pattern: /session|timeout|sitzung/i,
    action: 'accept',
  },
];

// ---------------------------------------------------------------------------
// PopupHandler-Klasse
// ---------------------------------------------------------------------------

export class PopupHandler {
  private cdpSession: CdpSession | null = null;
  private rules: DialogRule[] = [...DEFAULT_RULES];
  private log: DialogEvent[] = [];
  private readonly maxLogEntries: number = 500;
  private dialogListener: ((params: unknown) => void) | null = null;

  /**
   * Standardaktion, wenn keine Regel greift.
   * 'accept' ist für CRM-Bestätigungen oft sicherer als 'dismiss'.
   */
  private defaultAction: DialogAction = 'accept';

  // -------------------------------------------------------------------------
  // Öffentliche API
  // -------------------------------------------------------------------------

  /**
   * Initialisiert den Handler mit einer CDP-Session.
   * Richtet den Event-Listener für Page.javascriptDialogOpening ein.
   *
   * @param cdpSession - Aktive CDP-Session (z.B. von chrome-remote-interface)
   */
  init(cdpSession: CdpSession): void {
    // Alten Listener entfernen falls vorhanden (Re-Init-Schutz)
    this.detachListener();

    this.cdpSession = cdpSession;

    // CDP: Dialoge aktivieren (muss explizit eingeschaltet werden)
    this.cdpSession
      .send('Page.enable')
      .catch((err: unknown) => this.logError('Page.enable fehlgeschlagen', err));

    // Event-Listener für JavaScript-Dialoge registrieren
    this.dialogListener = (params: unknown) => {
      if (
        typeof params !== 'object' ||
        params === null ||
        typeof (params as Record<string, unknown>)['message'] !== 'string'
      ) {
        return; // Unerwartetes CDP-Event-Format — ignorieren
      }
      void this.handleJavaScriptDialog(params as JavaScriptDialogOpeningPayload);
    };

    this.cdpSession.on('Page.javascriptDialogOpening', this.dialogListener);

    console.log('[PopupHandler] Initialisiert — überwacht JavaScript-Dialoge via CDP');
  }

  /**
   * Fügt eine neue Dialog-Regel am Anfang der Regelliste ein.
   * Eigene Regeln haben Vorrang vor den Default-Regeln.
   *
   * @param pattern - Regulärer Ausdruck gegen den Dialog-Text
   * @param action  - 'accept' oder 'dismiss'
   * @param promptText - Optionaler Text für prompt-Dialoge
   */
  addRule(pattern: RegExp, action: DialogAction, promptText?: string): void {
    // Neue Regel an den Anfang → höchste Priorität
    this.rules.unshift({ pattern, action, promptText });
    console.log(`[PopupHandler] Regel hinzugefügt: /${pattern.source}/ → ${action}`);
  }

  /**
   * Gibt eine Kopie des Dialog-Logs zurück.
   */
  getDialogLog(): DialogEvent[] {
    return [...this.log];
  }

  /**
   * Leert den Dialog-Log.
   */
  clearLog(): void {
    this.log = [];
    console.log('[PopupHandler] Log geleert');
  }

  /**
   * Setzt die Standardaktion für nicht gematchte Dialoge.
   * Standard: 'accept'
   */
  setDefaultAction(action: DialogAction): void {
    this.defaultAction = action;
  }

  /**
   * Entfernt alle Listener und setzt den Handler zurück.
   * Sollte beim Beenden der Automatisierung aufgerufen werden.
   */
  destroy(): void {
    this.detachListener();
    this.cdpSession = null;
    console.log('[PopupHandler] Zerstört');
  }

  /**
   * Schließt HTML-<dialog>-Elemente auf der aktuellen Seite per DOM-Klick.
   * Nützlich für modale Dialoge, die kein JavaScript-Dialog (alert/confirm) sind.
   *
   * @param preferAction - Bevorzugte Aktion: welchen Button anklicken
   * @returns Anzahl der geschlossenen Dialoge
   */
  async closeHtmlDialogs(preferAction: DialogAction = 'accept'): Promise<number> {
    if (!this.cdpSession) {
      console.warn('[PopupHandler] closeHtmlDialogs: Kein CDP-Session vorhanden');
      return 0;
    }

    // JavaScript im Browser-Kontext ausführen um <dialog>-Elemente zu finden
    const result = await this.cdpSession.send('Runtime.evaluate', {
      expression: `
        (function() {
          const dialogs = Array.from(document.querySelectorAll('dialog[open]'));
          let closed = 0;
          dialogs.forEach(dialog => {
            // Versuche passenden Button zu finden
            const acceptSelectors = [
              'button[data-action="confirm"]',
              'button[data-action="ok"]',
              'button.btn-primary',
              'button.confirm',
              'button.ok',
              'button[type="submit"]',
            ];
            const dismissSelectors = [
              'button[data-action="cancel"]',
              'button[data-action="dismiss"]',
              'button.btn-secondary',
              'button.cancel',
              'button.close',
            ];
            const selectors = ${preferAction === 'accept' ? 'acceptSelectors' : 'dismissSelectors'};
            const fallback = ${preferAction === 'accept' ? 'dismissSelectors' : 'acceptSelectors'};

            let btn = null;
            for (const sel of selectors) {
              btn = dialog.querySelector(sel);
              if (btn) break;
            }
            // Fallback auf gegenteilige Buttons
            if (!btn) {
              for (const sel of fallback) {
                btn = dialog.querySelector(sel);
                if (btn) break;
              }
            }
            // Letzter Fallback: irgendein Button
            if (!btn) btn = dialog.querySelector('button');

            if (btn) {
              btn.click();
              closed++;
            } else {
              // Kein Button gefunden — Dialog per close() schließen
              dialog.close();
              closed++;
            }
          });
          return closed;
        })()
      `,
      returnByValue: true,
    }) as { result?: { value?: number } };

    const closedCount = result?.result?.value ?? 0;

    if (closedCount > 0) {
      const event: DialogEvent = {
        timestamp: new Date(),
        type: 'html-dialog',
        message: `${closedCount} HTML-<dialog>-Element(e) geschlossen`,
        action: preferAction,
      };
      this.log.push(event);
      if (this.log.length > this.maxLogEntries) {
        this.log.splice(0, this.log.length - this.maxLogEntries);
      }
      console.log(`[PopupHandler] ${closedCount} HTML-Dialog(e) geschlossen (${preferAction})`);
    }

    return closedCount;
  }

  // -------------------------------------------------------------------------
  // Private Methoden
  // -------------------------------------------------------------------------

  /**
   * CDP-Event-Handler für Page.javascriptDialogOpening.
   * Bestimmt die Aktion anhand der Regeln und antwortet via CDP.
   */
  private async handleJavaScriptDialog(
    payload: JavaScriptDialogOpeningPayload,
  ): Promise<void> {
    if (!this.cdpSession) return;

    const { message, type, defaultPrompt } = payload;

    console.log(`[PopupHandler] Dialog erkannt — Typ: ${type}, Nachricht: "${message}"`);

    // Passende Regel suchen
    const { action, promptText, ruleMatched } = this.resolveAction(message, type);

    // Antworttext für prompt-Dialoge ermitteln
    // Bei prompt: promptText aus Regel, sonst defaultPrompt des Browsers, sonst leer
    const responseText =
      type === 'prompt' ? (promptText ?? defaultPrompt ?? '') : undefined;

    try {
      // CDP-Befehl: Dialog behandeln
      await this.cdpSession.send('Page.handleJavaScriptDialog', {
        accept: action === 'accept',
        ...(responseText !== undefined ? { promptText: responseText } : {}),
      });

      // Erfolg loggen
      const event: DialogEvent = {
        timestamp: new Date(),
        type,
        message,
        action,
        ...(responseText !== undefined ? { promptText: responseText } : {}),
        ...(ruleMatched ? { ruleMatched } : {}),
      };
      this.log.push(event);
      if (this.log.length > this.maxLogEntries) {
        this.log.splice(0, this.log.length - this.maxLogEntries);
      }

      console.log(
        `[PopupHandler] Dialog behandelt — Aktion: ${action}` +
          (ruleMatched ? `, Regel: /${ruleMatched}/` : ' (Standard)') +
          (responseText !== undefined ? `, Antworttext: "${responseText}"` : ''),
      );
    } catch (err: unknown) {
      this.logError(`Dialog-Behandlung fehlgeschlagen (${type}: "${message}")`, err);
    }
  }

  /**
   * Bestimmt die Aktion und den optionalen Prompt-Text anhand der Regelliste.
   * Erste Übereinstimmung gewinnt.
   *
   * @param message - Dialog-Text
   * @param type    - Dialog-Typ (alert/confirm/prompt/beforeunload)
   */
  private resolveAction(
    message: string,
    type: DialogType,
  ): { action: DialogAction; promptText?: string; ruleMatched?: string } {
    // alert hat keine sinnvolle dismiss-Semantik — immer akzeptieren
    if (type === 'alert') {
      return { action: 'accept' };
    }

    // beforeunload: standardmäßig dismiss (Seite bleibt offen)
    if (type === 'beforeunload') {
      return { action: 'dismiss' };
    }

    // Regeln durchsuchen
    for (const rule of this.rules) {
      if (rule.pattern.test(message)) {
        return {
          action: rule.action,
          promptText: rule.promptText,
          ruleMatched: rule.pattern.source,
        };
      }
    }

    // Kein Match — Standardaktion anwenden
    return { action: this.defaultAction };
  }

  /**
   * Entfernt den aktiven CDP-Event-Listener.
   */
  private detachListener(): void {
    if (this.cdpSession && this.dialogListener) {
      if (typeof this.cdpSession.off === 'function') {
        this.cdpSession.off('Page.javascriptDialogOpening', this.dialogListener);
      }
      this.dialogListener = null;
    }
  }

  /**
   * Einheitliche Fehler-Ausgabe.
   */
  private logError(context: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PopupHandler] FEHLER — ${context}: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Singleton-Export für einfache Verwendung
// ---------------------------------------------------------------------------

/** Vorkonfigurierte Standard-Instanz */
export const popupHandler = new PopupHandler();

// ---------------------------------------------------------------------------
// Hilfsfunktion: Direkte Dialog-Behandlung ohne Klasse (für schnelle Tests)
// ---------------------------------------------------------------------------

/**
 * Behandelt den aktuell offenen JavaScript-Dialog direkt via CDP.
 * Nützlich wenn kein vollständiger PopupHandler benötigt wird.
 *
 * @param session - CDP-Session
 * @param accept  - true = akzeptieren, false = ablehnen
 * @param promptText - Optionaler Text für prompt-Dialoge
 */
export async function handleCurrentDialog(
  session: CdpSession,
  accept: boolean,
  promptText?: string,
): Promise<void> {
  await session.send('Page.handleJavaScriptDialog', {
    accept,
    ...(promptText !== undefined ? { promptText } : {}),
  });
}

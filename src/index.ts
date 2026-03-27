/**
 * index.ts — Haupt-Entry-Point der CRM-Automatisierung
 * =====================================================
 * Orchestriert SessionManager, PopupHandler, FileUploadManager und CrmScheduler.
 *
 * Ziel-System : crm.job-step.com
 * CDP-Endpunkt: localhost:9222
 * Plattform   : Windows 11
 *
 * Shutdown-Reihenfolge (SIGINT / SIGTERM):
 *   1. Scheduler-Jobs stoppen
 *   2. FileUploadManager cleanup (temporäre Dateien)
 *   3. PopupHandler destroy
 *   4. SessionManager disconnect
 *
 * Exit-Codes:
 *   0 — sauberer Shutdown
 *   1 — erzwungener Abbruch (Timeout oder unbehandelter Fehler)
 */

import { SessionManager }    from './session-manager';
import { PopupHandler }       from './popup-handler';
import { FileUploadManager }  from './file-upload';
import { CrmScheduler, SCHEDULE } from './scheduler';

// ---------------------------------------------------------------------------
// Modul-Instanzen (global deklariert für Zugriff im Shutdown-Handler)
// ---------------------------------------------------------------------------

/** Verwaltet die Chrome-CDP-Session */
let sessionManager:   SessionManager   | null = null;
/** Behandelt JavaScript- und HTML-Dialoge */
let popupHandler:     PopupHandler     | null = null;
/** Steuert Datei-Uploads via CDP */
let fileUploadManager: FileUploadManager | null = null;
/** Koordiniert geplante Automatisierungs-Jobs */
let crmScheduler:     CrmScheduler    | null = null;

/** Verhindert mehrfaches Ausführen des Shutdown-Handlers */
let shutdownInProgress = false;

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------

/**
 * Fährt alle Module sauber in der vorgeschriebenen Reihenfolge herunter.
 *
 * Jeder Schritt ist in einem eigenen try/catch eingewickelt, damit ein
 * fehlschlagender Shutdown-Schritt die nachfolgenden Schritte nicht blockiert.
 *
 * @param signal  Auslösendes Signal (für Logging)
 * @param exitCode  0 = sauber, 1 = erzwungen
 */
async function gracefulShutdown(signal: string, exitCode: number = 0): Promise<void> {
  // Mehrfach-Aufruf verhindern (z.B. gleichzeitige SIGINT + SIGTERM)
  if (shutdownInProgress) {
    console.log(`[index] Shutdown läuft bereits – Signal ${signal} ignoriert.`);
    return;
  }
  shutdownInProgress = true;

  console.log(`\n[index] Signal: ${signal} — starte Graceful Shutdown…`);

  // Sicherheitsnetz: Wenn der Shutdown nach 10 Sekunden nicht abgeschlossen ist,
  // Process hart beenden um hängende Event-Loops zu vermeiden.
  const forceExitTimer = setTimeout(() => {
    console.error('[index] WARNUNG: Shutdown-Timeout (10 s) überschritten — erzwungener Exit.');
    process.exit(1);
  }, 10_000);

  // Timer soll den Prozess nicht künstlich am Leben halten
  forceExitTimer.unref();

  // ── Schritt 1: Scheduler-Jobs stoppen ─────────────────────────────────────
  try {
    if (crmScheduler !== null) {
      console.log('[index] Stoppe Scheduler-Jobs…');
      // shutdown() wartet auf laufende Tasks (max 5s), zerstört Cron-Handles und löscht Windows-Tasks
      await crmScheduler.shutdown();
      console.log('[index] Scheduler sauber heruntergefahren.');
    }
  } catch (err) {
    // Ein Fehler hier darf Schritt 2–4 nicht verhindern
    console.error('[index] Fehler beim Stoppen des Schedulers:', (err as Error).message);
  }

  // ── Schritt 2: FileUploadManager cleanup (temp-Dateien löschen) ───────────
  try {
    if (fileUploadManager !== null) {
      console.log('[index] FileUploadManager — bereinige temporäre Dateien…');
      fileUploadManager.cleanup();
      console.log('[index] FileUploadManager cleanup abgeschlossen.');
    }
  } catch (err) {
    console.error('[index] Fehler beim FileUploadManager cleanup:', (err as Error).message);
  }

  // ── Schritt 3: PopupHandler destroy ───────────────────────────────────────
  try {
    if (popupHandler !== null) {
      console.log('[index] PopupHandler — entferne Event-Listener…');
      popupHandler.destroy();
      console.log('[index] PopupHandler zerstört.');
    }
  } catch (err) {
    console.error('[index] Fehler beim PopupHandler destroy:', (err as Error).message);
  }

  // ── Schritt 4: SessionManager disconnect ──────────────────────────────────
  try {
    if (sessionManager !== null) {
      console.log('[index] SessionManager — trenne CDP-Verbindung…');
      sessionManager.close();
      console.log('[index] SessionManager getrennt.');
    }
  } catch (err) {
    console.error('[index] Fehler beim SessionManager disconnect:', (err as Error).message);
  }

  // Sicherheits-Timer abbrechen (Shutdown erfolgreich)
  clearTimeout(forceExitTimer);

  console.log('[index] Graceful Shutdown abgeschlossen. Beende Prozess.');
  process.exit(exitCode);
}

// ---------------------------------------------------------------------------
// Signal-Handler
// ---------------------------------------------------------------------------

/**
 * SIGINT: Ctrl+C durch den Benutzer.
 * Startet sauberen Shutdown mit Exit-Code 0.
 */
process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT', 0);
});

/**
 * SIGTERM: Kommt vom Windows Task Scheduler, pm2, Docker, systemd etc.
 * Ebenfalls sauberer Shutdown mit Exit-Code 0.
 */
process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM', 0);
});

// ---------------------------------------------------------------------------
// Unhandled Rejection Handler
// ---------------------------------------------------------------------------

/**
 * Fängt Promise-Rejections ab, die nirgendwo mit .catch() behandelt wurden.
 * Loggt die Ursache und fährt den Prozess mit Exit-Code 1 herunter,
 * damit externe Prozess-Überwachung (pm2, Task Scheduler) einen Neustart triggern kann.
 */
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  const message = reason instanceof Error
    ? `${reason.name}: ${reason.message}\n${reason.stack ?? ''}`
    : String(reason);

  console.error('[index] KRITISCH — Unbehandelte Promise-Rejection:');
  console.error(`[index] Promise: ${String(promise)}`);
  console.error(`[index] Ursache: ${message}`);

  // Sauberer Shutdown auch bei unerwarteten Fehlern, aber mit Exit-Code 1
  void gracefulShutdown('unhandledRejection', 1);
});

/**
 * Fängt synchrone Ausnahmen ab, die nicht innerhalb von try/catch liegen.
 * Sollte in gut geschriebenem Code nie auftreten — ist aber ein letztes Sicherheitsnetz.
 */
process.on('uncaughtException', (err: Error) => {
  console.error('[index] KRITISCH — Nicht abgefangene Ausnahme:');
  console.error(`[index] ${err.name}: ${err.message}`);
  console.error(err.stack ?? '(kein Stack verfügbar)');

  void gracefulShutdown('uncaughtException', 1);
});

// ---------------------------------------------------------------------------
// Start-Sequenz
// ---------------------------------------------------------------------------

/**
 * Initialisiert alle Module der Reihe nach und meldet den Bereitschaftsstatus.
 * Schlägt ein Modul fehl, wird der Prozess mit Exit-Code 1 beendet.
 */
async function initializeModules(): Promise<void> {
  console.log('[index] ═══════════════════════════════════════════════════');
  console.log('[index]  CRM-Automatisierung startet …');
  console.log(`[index]  Zeitstempel: ${new Date().toISOString()}`);
  console.log('[index] ═══════════════════════════════════════════════════');

  // ── 1. SessionManager ────────────────────────────────────────────────────
  console.log('[index] [1/4] Initialisiere SessionManager…');
  sessionManager = new SessionManager({
    cdpHost:          'localhost',
    cdpPort:          9222,
    profilePath:      'C:/Users/ds/.chrome-debug-profile',
    targetUrl:        'https://crm.job-step.com',
    loginUrl:         'https://crm.job-step.com/login',
    commandTimeoutMs: 15_000,
    maxRetries:       3,
  });
  await sessionManager.init();
  console.log('[index] [1/4] SessionManager — BEREIT ✓');

  // ── 2. PopupHandler ──────────────────────────────────────────────────────
  // Der PopupHandler benötigt eine CdpSession-kompatible Schnittstelle.
  // Da SessionManager keine CdpSession direkt exponiert, verwenden wir
  // den globalen singleton aus popup-handler.ts direkt und initialisieren
  // ihn mit einem passenden Adapter-Objekt.
  //
  // HINWEIS: Falls SessionManager zukünftig getCdpSession() exponiert,
  // diesen Abschnitt entsprechend anpassen.
  console.log('[index] [2/4] Initialisiere PopupHandler…');
  popupHandler = new PopupHandler();
  popupHandler.init(sessionManager.getCdpSession());
  console.log('[index] [2/4] PopupHandler — BEREIT ✓');

  // ── 3. FileUploadManager ─────────────────────────────────────────────────
  console.log('[index] [3/4] Initialisiere FileUploadManager…');
  fileUploadManager = new FileUploadManager({
    cdpHost:      'localhost',
    cdpPort:      9222,
    maxRetries:   3,
    retryDelayMs: 1_500,
    timeoutMs:    10_000,
    verbose:      true,
  });
  // FileUploadManager baut die CDP-Verbindung lazy auf (bei erstem Upload),
  // daher ist hier kein expliziter async init()-Aufruf erforderlich.
  console.log('[index] [3/4] FileUploadManager — BEREIT ✓');

  // ── 4. CrmScheduler ──────────────────────────────────────────────────────
  console.log('[index] [4/4] Initialisiere CrmScheduler…');
  crmScheduler = new CrmScheduler('C:\\Users\\ds\\crm-automation\\logs');
  console.log('[index] [4/4] CrmScheduler — BEREIT ✓');

  console.log('[index] ───────────────────────────────────────────────────');
  console.log('[index] Alle Module initialisiert — System bereit.');
  console.log('[index] ───────────────────────────────────────────────────');
}

// ---------------------------------------------------------------------------
// Haupt-Ausführungsschleife
// ---------------------------------------------------------------------------

/**
 * Registriert die geplanten Automatisierungs-Jobs und führt die initiale
 * Prüfung der CRM-Session durch.
 *
 * Diese Funktion demonstriert den typischen Ablauf:
 *   1. Zur CRM-Startseite navigieren
 *   2. Session-Gültigkeit prüfen / Re-Login anstoßen
 *   3. Wiederkehrende Jobs im Scheduler registrieren
 */
async function runAutomation(): Promise<void> {
  // Sicherheitsannahme: initializeModules() wurde bereits aufgerufen
  if (!sessionManager || !crmScheduler || !fileUploadManager || !popupHandler) {
    throw new Error('[index] Module nicht initialisiert — runAutomation() zu früh aufgerufen.');
  }

  // ── Schritt A: Session prüfen ─────────────────────────────────────────────
  console.log('[index] Prüfe CRM-Session…');
  const sessionGültig = await sessionManager.isSessionValid();

  if (sessionGültig) {
    console.log('[index] Session gültig — keine Anmeldung erforderlich.');
  } else {
    // Re-Login anstoßen; Credential-Eingabe übernimmt ein separates Modul
    console.log('[index] Session abgelaufen — starte Re-Login-Prozess…');
    await sessionManager.triggerRelogin();
    console.log('[index] Re-Login-Seite geladen. Bitte Zugangsdaten eingeben (manuell oder via login-handler).');
  }

  // ── Schritt B: Geplante Jobs registrieren ─────────────────────────────────
  console.log('[index] Registriere geplante Automatisierungs-Jobs…');

  // Beispiel-Job 1: Tägliche Session-Prüfung um 07:45 Uhr
  crmScheduler.scheduleCronJob(
    'session-check-daily',
    async () => {
      console.log('[job:session-check] Prüfe Session-Gültigkeit…');
      const valid = await sessionManager!.isSessionValid();
      if (!valid) {
        console.warn('[job:session-check] Session ungültig — Re-Login wird angestoßen.');
        await sessionManager!.triggerRelogin();
      } else {
        console.log('[job:session-check] Session gültig.');
      }
    },
    '45 7 * * 1-5',           // Werktags um 07:45
    { maxRetries: 2, retryDelayMs: 60_000 }
  );
  console.log('[index] Job "session-check-daily" registriert (werktags 07:45).');

  // Beispiel-Job 2: Stündliche Popup-Bereinigung (HTML-Dialoge schließen)
  crmScheduler.scheduleCronJob(
    'popup-cleanup-hourly',
    async () => {
      console.log('[job:popup-cleanup] Schließe offene HTML-Dialoge…');
      await popupHandler!.closeHtmlDialogs();
      console.log('[job:popup-cleanup] Fertig.');
    },
    SCHEDULE.HOURLY,
    { maxRetries: 1, retryDelayMs: 5_000 }
  );
  console.log('[index] Job "popup-cleanup-hourly" registriert (stündlich).');

  // ── Schritt C: Session exportieren (Backup) ───────────────────────────────
  try {
    const sessionBackupPath = 'C:/Users/ds/crm-automation/data/session-backup.json';
    await sessionManager.exportSession(sessionBackupPath);
    console.log(`[index] Session-Backup gespeichert: ${sessionBackupPath}`);
  } catch (err) {
    // Backup-Fehler sind nicht kritisch — Automatisierung läuft trotzdem weiter
    console.warn('[index] Session-Backup fehlgeschlagen (nicht kritisch):', (err as Error).message);
  }

  // ── Schritt D: Aktiven Jobs anzeigen ─────────────────────────────────────
  const aktiveJobs = crmScheduler.listSchedules();
  console.log(`[index] ${aktiveJobs.length} aktive Job(s):`);
  for (const job of aktiveJobs) {
    console.log(`[index]   • ${job.name} [${job.type}] — ${job.cronExpr}`);
  }

  console.log('[index] Automatisierung läuft. Drücke Strg+C zum Beenden.');
}

// ---------------------------------------------------------------------------
// Einstiegspunkt
// ---------------------------------------------------------------------------

/**
 * Hauptfunktion — wird sofort aufgerufen (IIFE-Muster).
 *
 * Fehler hier werden durch den unhandledRejection-Handler abgefangen,
 * der einen Graceful Shutdown mit Exit-Code 1 auslöst.
 */
(async () => {
  try {
    // Alle Module starten
    await initializeModules();

    // Automatisierungslogik ausführen
    await runAutomation();

    // Ab hier hält der Prozess durch die registrierten Cron-Jobs den Event-Loop am Leben.
    // Der Prozess endet erst durch SIGINT, SIGTERM oder einen unbehandelten Fehler.
  } catch (err) {
    // Kritischer Fehler während der Initialisierung oder Ausführung
    console.error('[index] KRITISCH — Startfehler:');
    console.error((err as Error).message);
    if ((err as Error).stack) {
      console.error((err as Error).stack);
    }

    // Sauberer Shutdown mit Exit-Code 1 (löst Neustart durch pm2 / Task Scheduler aus)
    await gracefulShutdown('startup-error', 1);
  }
})();

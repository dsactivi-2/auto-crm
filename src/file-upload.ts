/**
 * file-upload.ts
 * Datei-Upload-Modul für CRM-Automatisierung via Chrome DevTools Protocol (CDP)
 * Ziel: crm.job-step.com | CDP-Endpunkt: localhost:9222
 *
 * WICHTIG: Dieses Modul arbeitet AUSSCHLIESSLICH mit CDP (kein Playwright, kein Stagehand).
 * Windows-Pfade werden intern normalisiert (Backslash → Forward-Slash für CDP).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

// ─────────────────────────────────────────────────────────────────────────────
// Typen & Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/** CDP JSON/Targets-Antwort von /json */
interface CdpTarget {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

/** Generische CDP-Nachricht (Request) */
interface CdpRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

/** Generische CDP-Antwort */
interface CdpResponse {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  sessionId?: string;
}

/** CDP DOM.setFileInputFiles – Parameter */
interface SetFileInputFilesParams {
  /** CSS-Selektor des Input-Elements */
  selector?: string;
  /** Absoluter Pfad zur Datei (Forward-Slashes, auch unter Windows) */
  files: string[];
  /** Optionaler Node-Identifier (falls Selektor nicht ausreicht) */
  nodeId?: number;
  /** Backend-Node-ID (für remote Nodes) */
  backendNodeId?: number;
  /** Object-ID (Runtime.RemoteObjectId) */
  objectId?: string;
}

/** Intern: Ergebnis eines DOM.querySelector-Aufrufs */
interface QuerySelectorResult {
  nodeId: number;
}

/** Intern: Ergebnis von Runtime.getProperties / DOM.describeNode */
interface DomNodeDescription {
  node: {
    nodeId: number;
    backendNodeId: number;
    nodeName: string;
    attributes?: string[];
  };
}

/** Konfiguration für FileUploadManager */
export interface FileUploadManagerConfig {
  /** CDP WebSocket URL – wird automatisch ermittelt wenn nicht angegeben */
  cdpWsUrl?: string;
  /** CDP HTTP-Host (Standard: localhost) */
  cdpHost?: string;
  /** CDP HTTP-Port (Standard: 9222) */
  cdpPort?: number;
  /** Maximale Wiederholungsversuche (Standard: 3) */
  maxRetries?: number;
  /** Wartezeit in ms zwischen Versuchen (Standard: 1500) */
  retryDelayMs?: number;
  /** Timeout für CDP-Operationen in ms (Standard: 10000) */
  timeoutMs?: number;
  /** Verzeichnis für temporäre Dateien (Standard: os.tmpdir()) */
  tmpDir?: string;
  /** Ausführliches Logging aktivieren */
  verbose?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hilfsfunktionen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalisiert einen Windows-Pfad für CDP:
 * CDP (Chrome) erwartet unter Windows Forward-Slashes OHNE führenden Slash.
 * Beispiel: "C:\Temp\file.pdf" → "C:/Temp/file.pdf"
 */
function normalizeCdpPath(filePath: string): string {
  // Backslashes → Forward-Slashes
  let normalized = filePath.replace(/\\/g, '/');
  // Führenden Slash entfernen falls vorhanden (z.B. /C:/...)
  if (/^\/[A-Za-z]:/.test(normalized)) {
    normalized = normalized.slice(1);
  }
  return normalized;
}

/**
 * Prüft, ob der gegebene Pfad ein absoluter Windows-Pfad ist (z.B. C:\...).
 */
function isAbsoluteWindowsPath(filePath: string): boolean {
  return /^[A-Za-z]:[/\\]/.test(filePath);
}

/**
 * Kleiner Promise-basierter Sleep-Helfer.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lädt eine Datei von einer HTTP/HTTPS-URL herunter und speichert sie
 * an einem temporären Pfad. Gibt den lokalen Pfad zurück.
 */
async function downloadToTempFile(
  url: string,
  tmpDir: string,
  maxRedirects: number = 5
): Promise<string> {
  const parsedUrl = new URL(url);

  // Dateiname aus URL ableiten (Fallback: zufälliger Name)
  const basename =
    path.basename(parsedUrl.pathname) ||
    `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Sicherheitsfilter: keine Pfad-Traversal im Dateinamen
  const safeName = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const tmpPath = path.join(tmpDir, `cdp-upload-${Date.now()}-${safeName}`);

  return new Promise((resolve, reject) => {
    const transport = parsedUrl.protocol === 'https:' ? https : http;
    const fileStream = fs.createWriteStream(tmpPath);

    const request = transport.get(url, (response) => {
      // Weiterleitungen folgen (max. 5 Hops)
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        fileStream.close();
        fs.unlink(tmpPath, () => undefined);
        if (maxRedirects <= 0) {
          reject(new Error('Maximale Anzahl an HTTP-Redirects (5) ueberschritten'));
          return;
        }
        // Rekursiv mit neuer URL und reduziertem Redirect-Zaehler
        downloadToTempFile(response.headers.location, tmpDir, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (!response.statusCode || response.statusCode >= 400) {
        fileStream.close();
        fs.unlink(tmpPath, () => undefined);
        reject(
          new Error(
            `HTTP-Fehler beim Download: ${response.statusCode} ${response.statusMessage}`
          )
        );
        return;
      }

      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(tmpPath);
      });
    });

    request.on('error', (err) => {
      fileStream.close();
      fs.unlink(tmpPath, () => undefined);
      reject(new Error(`Netzwerkfehler beim Download: ${err.message}`));
    });

    fileStream.on('error', (err) => {
      fileStream.close();
      fs.unlink(tmpPath, () => undefined);
      reject(new Error(`Dateifehler beim Schreiben: ${err.message}`));
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CDP WebSocket Client (minimale Implementierung ohne externe Abhängigkeiten)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Einfacher CDP-Client via nativen WebSocket (Node.js 21+) oder ws-Fallback.
 * Unter Node.js < 21 wird ws aus dem globalen Scope erwartet (falls vorhanden).
 * Node.js v18+ hat native fetch eingebaut — kein node-fetch nötig.
 */
class CdpClient {
  private ws: WebSocket | null = null;
  private messageId = 1;
  private pendingRequests = new Map<
    number,
    { resolve: (r: CdpResponse) => void; reject: (e: Error) => void }
  >();
  private eventListeners = new Map<
    string,
    Array<(params: Record<string, unknown>) => void>
  >();
  private sessionId: string | null = null;
  private connected = false;

  // Reconnect-Zustand
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly wsUrl: string) {}

  /** Verbindet mit dem CDP-Endpunkt */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Node.js 21+ hat globales WebSocket; ältere Versionen brauchen 'ws'
      let WsClass: typeof WebSocket;
      try {
        // Versuche natives WebSocket (Node 21+)
        WsClass = globalThis.WebSocket as typeof WebSocket;
        if (!WsClass) throw new Error('kein natives WebSocket');
      } catch {
        try {
          // Fallback: ws-Paket (falls installiert)
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          WsClass = require('ws');
        } catch {
          reject(
            new Error(
              'Kein WebSocket verfügbar. Node.js 21+ oder npm install ws erforderlich.'
            )
          );
          return;
        }
      }

      const socket = new WsClass(this.wsUrl);
      this.ws = socket as WebSocket;

      const onOpen = () => {
        this.connected = true;
        resolve();
      };

      const onMessage = (event: MessageEvent | { data: string }) => {
        const raw = typeof event === 'object' && 'data' in event
          ? (event as MessageEvent).data
          : (event as { data: string }).data;

        let msg: CdpResponse;
        try {
          msg = JSON.parse(raw as string) as CdpResponse;
        } catch {
          return; // Kein valides JSON → ignorieren
        }

        // Antwort auf pending Request
        if (msg.id !== undefined) {
          const pending = this.pendingRequests.get(msg.id);
          if (pending) {
            this.pendingRequests.delete(msg.id);
            if (msg.error) {
              pending.reject(
                new Error(
                  `CDP-Fehler [${msg.error.code}]: ${msg.error.message}`
                )
              );
            } else {
              pending.resolve(msg);
            }
          }
          return;
        }

        // CDP-Event
        if (msg.method) {
          const listeners = this.eventListeners.get(msg.method) ?? [];
          for (const listener of listeners) {
            listener(msg.params ?? {});
          }
        }
      };

      const onClose = () => {
        this.connected = false;
        this.scheduleReconnect();
      };

      const onErrorWithReconnect = (err: Event | Error) => {
        const message = err instanceof Error ? err.message : String(err);
        // Wenn noch nicht verbunden war: initialer Verbindungsfehler → reject
        if (!this.connected) {
          reject(new Error(`WebSocket-Verbindungsfehler: ${message}`));
        } else {
          // Verbindung wurde unterbrochen → Reconnect auslösen
          this.connected = false;
          this.scheduleReconnect();
        }
      };

      // Beide APIs unterstützen (native WS & ws-Paket)
      if (typeof socket.addEventListener === 'function') {
        socket.addEventListener('open', onOpen);
        socket.addEventListener('error', onErrorWithReconnect as (evt: Event) => void);
        socket.addEventListener('message', onMessage as (evt: Event) => void);
        socket.addEventListener('close', onClose);
      } else {
        // ws-Paket nutzt .on()
        const wsEmitter = socket as unknown as {
          on(event: string, cb: (...args: unknown[]) => void): void;
        };
        wsEmitter.on('open', onOpen);
        wsEmitter.on('error', (...args: unknown[]) => onErrorWithReconnect(args[0] as Error));
        wsEmitter.on('message', (...args: unknown[]) => onMessage({ data: args[0] as string }));
        wsEmitter.on('close', onClose);
      }
    });
  }

  /**
   * Plant einen Reconnect-Versuch mit Exponential Backoff.
   * Backoff: 1s, 2s, 4s, 8s, 16s – gekappt bei 30s.
   * Maximal 5 Versuche; pending Requests werden sofort abgebrochen.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      // Bereits ein Reconnect geplant
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      // Kein weiterer Versuch – alle Pending-Requests mit Fehler abbrechen
      this.abortPendingRequests(
        new Error(
          `CDP-Verbindung verloren. Maximale Reconnect-Versuche (${this.maxReconnectAttempts}) erschöpft.`
        )
      );
      return;
    }

    // Pending Requests des abgebrochenen Zyklus sofort mit Fehler beenden
    this.abortPendingRequests(
      new Error('CDP-Verbindungsabbruch – Reconnect wird versucht')
    );

    const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
    this.reconnectAttempts++;

    console.warn(
      `[CdpClient] Verbindung verloren. Reconnect-Versuch ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delayMs}ms...`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect()
        .then(() => {
          console.log(
            `[CdpClient] Reconnect nach ${this.reconnectAttempts} Versuch(en) erfolgreich.`
          );
          this.reconnectAttempts = 0; // Zähler bei Erfolg zurücksetzen
        })
        .catch((err: Error) => {
          console.error(`[CdpClient] Reconnect fehlgeschlagen: ${err.message}`);
          // scheduleReconnect wird intern durch den close/error-Handler erneut aufgerufen
        });
    }, delayMs);
  }

  /**
   * Bricht alle ausstehenden Requests mit einem Fehler ab.
   * Wird bei Verbindungsabbruch aufgerufen, damit Caller nicht hängen bleiben.
   */
  private abortPendingRequests(error: Error): void {
    if (this.pendingRequests.size === 0) return;
    this.pendingRequests.forEach(({ reject }) => reject(error));
    this.pendingRequests.clear();
  }

  /** Sendet einen CDP-Befehl und wartet auf die Antwort */
  async send(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 10000
  ): Promise<CdpResponse> {
    if (!this.connected || !this.ws) {
      throw new Error('CDP-Client nicht verbunden');
    }

    const id = this.messageId++;
    const request: CdpRequest = { id, method, params };

    // Session-ID anhängen falls aktive Session vorhanden (für Target-basierte Befehle)
    if (this.sessionId) {
      request.sessionId = this.sessionId;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(
            `CDP-Timeout (${timeoutMs}ms) für Methode: ${method}`
          )
        );
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (response) => {
          clearTimeout(timer);
          resolve(response);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      const payload = JSON.stringify(request);
      if (typeof (this.ws as WebSocket).send === 'function') {
        (this.ws as WebSocket).send(payload);
      }
    });
  }

  /** Registriert einen Listener für CDP-Events */
  on(
    event: string,
    listener: (params: Record<string, unknown>) => void
  ): void {
    const existing = this.eventListeners.get(event) ?? [];
    existing.push(listener);
    this.eventListeners.set(event, existing);
  }

  /** Setzt die aktive Session-ID (für Target.attachToTarget) */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /** Trennt die WebSocket-Verbindung und bricht laufende Reconnect-Versuche ab */
  disconnect(): void {
    // Keinen weiteren Reconnect auslösen
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // Weitere scheduleReconnect-Aufrufe verhindern

    this.connected = false;
    if (this.ws) {
      try {
        (this.ws as WebSocket).close();
      } catch {
        // Ignorieren – bereits getrennt
      }
      this.ws = null;
    }
    this.abortPendingRequests(new Error('CDP-Client getrennt'));
  }

  get isConnected(): boolean {
    return this.connected;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FileUploadManager – Haupt-Klasse
// ─────────────────────────────────────────────────────────────────────────────

export class FileUploadManager {
  private readonly config: Required<FileUploadManagerConfig>;
  private cdpClient: CdpClient | null = null;
  private tempFiles: string[] = []; // Temporäre Dateien für späteres Cleanup

  constructor(config: FileUploadManagerConfig = {}) {
    this.config = {
      cdpWsUrl: config.cdpWsUrl ?? '',
      cdpHost: config.cdpHost ?? 'localhost',
      cdpPort: config.cdpPort ?? 9222,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1500,
      timeoutMs: config.timeoutMs ?? 10000,
      tmpDir: config.tmpDir ?? os.tmpdir(),
      verbose: config.verbose ?? false,
    };
  }

  // ── Private Hilfsmethoden ────────────────────────────────────────────────

  private log(message: string, ...args: unknown[]): void {
    if (this.config.verbose) {
      console.log(`[FileUploadManager] ${message}`, ...args);
    }
  }

  private logError(message: string, ...args: unknown[]): void {
    console.error(`[FileUploadManager][ERROR] ${message}`, ...args);
  }

  /**
   * Stellt eine CDP-Verbindung her.
   * Ermittelt automatisch die WebSocket-URL des ersten "page"-Targets
   * via HTTP GET http://localhost:9222/json.
   */
  private async ensureConnected(): Promise<CdpClient> {
    if (this.cdpClient?.isConnected) {
      return this.cdpClient;
    }

    let wsUrl = this.config.cdpWsUrl;

    if (!wsUrl) {
      // Automatische Ziel-Erkennung: Ersten Page-Target aus /json auslesen
      wsUrl = await this.resolveWsUrl();
    }

    this.log(`Verbinde mit CDP: ${wsUrl}`);
    const client = new CdpClient(wsUrl);
    await client.connect();
    this.cdpClient = client;

    // DOM-Domain aktivieren (notwendig für querySelector & setFileInputFiles)
    await client.send('DOM.enable', {}, this.config.timeoutMs);

    this.log('CDP-Verbindung hergestellt');
    return client;
  }

  /**
   * Fragt den CDP-HTTP-Endpunkt nach verfügbaren Targets ab
   * und gibt die WebSocket-URL des ersten "page"-Targets zurück.
   */
  private resolveWsUrl(): Promise<string> {
    return new Promise((resolve, reject) => {
      const options = {
        host: this.config.cdpHost,
        port: this.config.cdpPort,
        path: '/json',
        timeout: 5000,
      };

      http
        .get(options, (response) => {
          let body = '';
          response.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          response.on('end', () => {
            try {
              const targets = JSON.parse(body) as CdpTarget[];
              const pageTarget = targets.find((t) => t.type === 'page');
              if (!pageTarget) {
                reject(
                  new Error(
                    'Kein "page"-Target gefunden. Ist Chrome mit --remote-debugging-port=9222 gestartet?'
                  )
                );
                return;
              }
              resolve(pageTarget.webSocketDebuggerUrl);
            } catch (err) {
              reject(
                new Error(`Fehler beim Parsen der CDP-Targets: ${String(err)}`)
              );
            }
          });
        })
        .on('error', (err) => {
          reject(
            new Error(
              `CDP-Endpunkt nicht erreichbar (${this.config.cdpHost}:${this.config.cdpPort}): ${err.message}`
            )
          );
        });
    });
  }

  /**
   * Sucht den DOM-Node für einen CSS-Selektor und gibt seine nodeId zurück.
   * Unterstützt auch versteckte Input-Felder (hidden inputs).
   * WICHTIG: Versteckte Inputs werden über JavaScript sichtbar gemacht,
   * damit CDP sie via setFileInputFiles ansprechen kann.
   */
  private async resolveNodeId(
    client: CdpClient,
    selector: string
  ): Promise<number> {
    // Dokument-Root ermitteln
    const docResult = await client.send(
      'DOM.getDocument',
      { depth: 0 },
      this.config.timeoutMs
    );
    const rootNodeId = (
      docResult.result as unknown as { root: { nodeId: number } }
    ).root.nodeId;

    // querySelector auf dem Root-Node ausführen
    const queryResult = await client.send(
      'DOM.querySelector',
      { nodeId: rootNodeId, selector },
      this.config.timeoutMs
    );
    const { nodeId } = queryResult.result as unknown as QuerySelectorResult;

    if (!nodeId || nodeId === 0) {
      throw new Error(
        `Element nicht gefunden für Selektor: "${selector}"`
      );
    }

    // Prüfen ob das Element versteckt ist – falls ja: temporär sichtbar machen
    await this.makeInputVisible(client, selector);

    return nodeId;
  }

  /**
   * Macht ein möglicherweise verstecktes File-Input sichtbar,
   * damit CDP es korrekt ansprechen kann.
   * Setzt display/visibility/opacity kurzzeitig auf sichtbar –
   * wird nach dem Upload nicht zurückgesetzt (CRM übernimmt das selbst).
   */
  private async makeInputVisible(
    client: CdpClient,
    selector: string
  ): Promise<void> {
    const script = `
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const style = window.getComputedStyle(el);
        const isHidden =
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.opacity === '0' ||
          el.type === 'hidden';
        if (isHidden) {
          el.style.display = 'block';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
          el.style.position = 'fixed';
          el.style.top = '-9999px';
          el.style.left = '-9999px';
          el.style.zIndex = '999999';
        }
        return isHidden;
      })()
    `;

    const result = await client.send(
      'Runtime.evaluate',
      { expression: script, returnByValue: true },
      this.config.timeoutMs
    );

    const wasHidden = (
      result.result as unknown as { result: { value: boolean } }
    )?.result?.value;

    if (wasHidden) {
      this.log(`Verstecktes Input sichtbar gemacht: ${selector}`);
    }
  }

  /**
   * Führt DOM.setFileInputFiles aus – das eigentliche CDP-Upload-Kommando.
   * Pfade werden für CDP normalisiert (Windows Backslash → Forward-Slash).
   */
  private async setFiles(
    client: CdpClient,
    nodeId: number,
    filePaths: string[]
  ): Promise<void> {
    // KRITISCH: CDP erwartet Forward-Slashes, auch unter Windows.
    const normalizedPaths = filePaths.map(normalizeCdpPath);

    this.log(`Setze Dateien via CDP DOM.setFileInputFiles:`, normalizedPaths);

    await client.send(
      'DOM.setFileInputFiles',
      {
        files: normalizedPaths,
        nodeId,
      } as unknown as Record<string, unknown>,
      this.config.timeoutMs
    );
  }

  /**
   * Retry-Wrapper: Führt eine Operation maximal `maxRetries`-mal aus.
   * Bei Fehler: wartet `retryDelayMs` und versucht es erneut.
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        this.log(
          `${operationName} – Versuch ${attempt}/${this.config.maxRetries}`
        );
        const result = await operation();
        this.log(`${operationName} – Versuch ${attempt} erfolgreich`);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logError(
          `${operationName} – Versuch ${attempt} fehlgeschlagen: ${lastError.message}`
        );

        if (attempt < this.config.maxRetries) {
          this.log(
            `Warte ${this.config.retryDelayMs}ms vor nächstem Versuch...`
          );
          await sleep(this.config.retryDelayMs);

          // Bei Verbindungsabbruch: Client zurücksetzen damit reconnect erfolgt
          if (
            lastError.message.includes('getrennt') ||
            lastError.message.includes('nicht verbunden')
          ) {
            this.cdpClient?.disconnect();
            this.cdpClient = null;
          }
        }
      }
    }

    throw new Error(
      `${operationName} nach ${this.config.maxRetries} Versuchen fehlgeschlagen. ` +
        `Letzter Fehler: ${lastError?.message ?? 'Unbekannt'}`
    );
  }

  /**
   * Validiert einen lokalen Dateipfad:
   * - Muss existieren
   * - Muss eine Datei sein (kein Verzeichnis)
   * - Muss lesbar sein
   */
  private validateLocalPath(filePath: string): void {
    if (!path.isAbsolute(filePath) && !isAbsoluteWindowsPath(filePath)) {
      throw new Error(
        `Kein absoluter Pfad: "${filePath}". ` +
          `Bitte absoluten Windows-Pfad angeben (z.B. C:\\Temp\\datei.pdf)`
      );
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Datei nicht gefunden: "${filePath}"`);
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new Error(`Pfad ist kein reguläres File: "${filePath}"`);
    }
  }

  // ── Öffentliche API ──────────────────────────────────────────────────────

  /**
   * Gibt zurück ob gerade eine aktive CDP-Verbindung besteht.
   */
  isConnected(): boolean {
    return this.cdpClient?.isConnected ?? false;
  }

  /**
   * Lädt eine einzelne lokale Datei in ein File-Input-Element hoch.
   *
   * @param filePath  Absoluter Windows-Pfad zur Datei (z.B. C:\Temp\dokument.pdf)
   * @param selector  CSS-Selektor des File-Input-Elements (z.B. 'input[type="file"]')
   * @returns         true wenn Upload erfolgreich verifiziert wurde, sonst false
   */
  async uploadFile(filePath: string, selector: string): Promise<boolean> {
    return this.withRetry(async () => {
      // Lokale Datei validieren
      this.validateLocalPath(filePath);

      const client = await this.ensureConnected();

      // DOM-Node für den Selektor ermitteln (inklusive Hidden-Input-Handling)
      const nodeId = await this.resolveNodeId(client, selector);

      // Datei via CDP setzen
      await this.setFiles(client, nodeId, [filePath]);

      // Kurz warten damit der Browser die Änderung verarbeitet
      await sleep(300);

      // Upload verifizieren
      const verified = await this.verifyUpload(selector);
      if (!verified) {
        throw new Error(
          `Upload-Verifikation fehlgeschlagen: files.length === 0 für "${selector}"`
        );
      }

      return true;
    }, `uploadFile("${path.basename(filePath)}", "${selector}")`);
  }

  /**
   * Lädt mehrere lokale Dateien gleichzeitig in ein File-Input-Element hoch.
   * Das Input-Element muss das multiple-Attribut unterstützen.
   *
   * @param filePaths  Array von absoluten Windows-Pfaden
   * @param selector   CSS-Selektor des File-Input-Elements
   * @returns          true wenn Upload erfolgreich verifiziert wurde, sonst false
   */
  async uploadMultiple(
    filePaths: string[],
    selector: string
  ): Promise<boolean> {
    if (filePaths.length === 0) {
      throw new Error('filePaths darf nicht leer sein');
    }

    return this.withRetry(async () => {
      // Alle Pfade validieren
      for (const filePath of filePaths) {
        this.validateLocalPath(filePath);
      }

      // Prüfen ob das Input-Element "multiple" unterstützt
      const client = await this.ensureConnected();
      const multipleCheck = await client.send(
        'Runtime.evaluate',
        {
          expression: `
            (function() {
              const el = document.querySelector(${JSON.stringify(selector)});
              return el ? el.multiple : null;
            })()
          `,
          returnByValue: true,
        },
        this.config.timeoutMs
      );
      const isMultiple = (
        multipleCheck.result as unknown as { result: { value: boolean | null } }
      )?.result?.value;

      if (isMultiple === false && filePaths.length > 1) {
        this.log(
          `WARNUNG: Input "${selector}" unterstützt kein multiple – nur erste Datei wird gesetzt`
        );
      }

      const nodeId = await this.resolveNodeId(client, selector);
      await this.setFiles(client, nodeId, filePaths);

      await sleep(300);

      const verified = await this.verifyUpload(selector);
      if (!verified) {
        throw new Error(
          `Upload-Verifikation fehlgeschlagen für Multiple-Upload auf "${selector}"`
        );
      }

      return true;
    }, `uploadMultiple([${filePaths.length} Dateien], "${selector}")`);
  }

  /**
   * Lädt eine Datei von einer Remote-URL herunter, speichert sie temporär,
   * lädt sie in das CRM hoch und bereinigt die temporäre Datei anschließend.
   *
   * Ablauf: URL → temp-Datei in os.tmpdir() → CDP-Upload → Cleanup
   *
   * @param url       HTTP/HTTPS-URL der herunterzuladenden Datei
   * @param selector  CSS-Selektor des File-Input-Elements
   * @returns         true wenn Upload erfolgreich verifiziert wurde, sonst false
   */
  async uploadFromUrl(url: string, selector: string): Promise<boolean> {
    // Alle temporären Dateien aller Retry-Versuche sammeln (nicht nur den letzten Pfad)
    const retryTempFiles: string[] = [];

    try {
      return await this.withRetry(async () => {
        // Sicherstellen dass tmp-Verzeichnis existiert
        if (!fs.existsSync(this.config.tmpDir)) {
          fs.mkdirSync(this.config.tmpDir, { recursive: true });
        }

        this.log(`Lade Datei von URL herunter: ${url}`);

        // Download in temporäre Datei
        const tmpFilePath = await downloadToTempFile(url, this.config.tmpDir);
        retryTempFiles.push(tmpFilePath); // Alle Retry-Versuche verfolgen
        this.tempFiles.push(tmpFilePath); // Für späteres cleanup() registrieren

        this.log(`Temporäre Datei erstellt: ${tmpFilePath}`);

        // Upload der temporären Datei
        const client = await this.ensureConnected();
        const nodeId = await this.resolveNodeId(client, selector);
        await this.setFiles(client, nodeId, [tmpFilePath]);

        await sleep(300);

        const verified = await this.verifyUpload(selector);
        if (!verified) {
          throw new Error(
            `Upload-Verifikation fehlgeschlagen für URL-Upload auf "${selector}"`
          );
        }

        this.log(`URL-Upload erfolgreich: ${url}`);
        return true;
      }, `uploadFromUrl("${url}", "${selector}")`);
    } finally {
      // KRITISCH: ALLE temporären Dateien aller Retry-Versuche löschen, auch bei Fehler
      for (const tmpFilePath of retryTempFiles) {
        if (fs.existsSync(tmpFilePath)) {
          try {
            fs.unlinkSync(tmpFilePath);
            // Aus der Tracking-Liste entfernen
            this.tempFiles = this.tempFiles.filter((f) => f !== tmpFilePath);
            this.log(`Temporäre Datei gelöscht: ${tmpFilePath}`);
          } catch (cleanupErr) {
            this.logError(
              `Konnte temporäre Datei nicht löschen: ${tmpFilePath}`,
              cleanupErr
            );
          }
        }
      }
    }
  }

  /**
   * Verifiziert ob ein File-Input-Element tatsächlich Dateien enthält.
   * Prüft files.length > 0 via JavaScript im Browser-Kontext.
   *
   * @param selector  CSS-Selektor des File-Input-Elements
   * @returns         true wenn files.length > 0, sonst false
   */
  async verifyUpload(selector: string): Promise<boolean> {
    try {
      const client = await this.ensureConnected();

      // JavaScript-Ausdruck: files.length des Input-Elements auslesen
      const script = `
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { found: false, count: 0 };
          const files = el.files;
          return {
            found: true,
            count: files ? files.length : 0,
            fileNames: files
              ? Array.from(files).map(function(f) { return f.name; })
              : []
          };
        })()
      `;

      const result = await client.send(
        'Runtime.evaluate',
        { expression: script, returnByValue: true },
        this.config.timeoutMs
      );

      const value = (
        result.result as unknown as {
          result: { value: { found: boolean; count: number; fileNames: string[] } };
        }
      )?.result?.value;

      if (!value || !value.found) {
        this.log(`verifyUpload: Element nicht gefunden für "${selector}"`);
        return false;
      }

      this.log(
        `verifyUpload: ${value.count} Datei(en) in "${selector}" – ` +
          `[${value.fileNames.join(', ')}]`
      );

      // Erfolgreich wenn mindestens eine Datei vorhanden ist
      return value.count > 0;
    } catch (err) {
      this.logError(`verifyUpload fehlgeschlagen:`, err);
      return false;
    }
  }

  /**
   * Bereinigt alle noch vorhandenen temporären Dateien
   * (für den Fall dass uploadFromUrl unterbrochen wurde).
   */
  cleanup(): void {
    for (const tmpPath of this.tempFiles) {
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
          this.log(`Cleanup: ${tmpPath} gelöscht`);
        } catch (err) {
          this.logError(`Cleanup fehlgeschlagen für ${tmpPath}:`, err);
        }
      }
    }
    this.tempFiles = [];
  }

  /**
   * Trennt die CDP-Verbindung und bereinigt Ressourcen.
   * Sollte am Ende der Nutzung aufgerufen werden.
   */
  disconnect(): void {
    this.cdpClient?.disconnect();
    this.cdpClient = null;
    this.cleanup();
    this.log('CDP-Verbindung getrennt und Ressourcen bereinigt');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default-Export und Convenience-Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Erstellt eine vorkonfigurierte FileUploadManager-Instanz
 * für crm.job-step.com mit Standardwerten.
 */
export function createFileUploadManager(
  config: FileUploadManagerConfig = {}
): FileUploadManager {
  return new FileUploadManager({
    cdpHost: 'localhost',
    cdpPort: 9222,
    maxRetries: 3,
    retryDelayMs: 1500,
    timeoutMs: 10000,
    tmpDir: os.tmpdir(),
    verbose: true,
    ...config,
  });
}

export default FileUploadManager;

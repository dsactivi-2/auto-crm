/**
 * session-manager.ts
 * ------------------
 * Verwaltet die Chrome-Session für crm.job-step.com via Chrome DevTools Protocol (CDP).
 * Stellt persistente Profile, Cookie-Export/-Import und automatischen Re-Login bereit.
 *
 * Kommunikation: HTTP + WebSocket gegen localhost:9222 (CDP-Endpunkt)
 * Kein Framework — nur Node.js-Bordmittel + native CDP-Interfaces.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// CDP-Typen (nur benötigte Teilmenge des vollständigen CDP-Protokolls)
// ---------------------------------------------------------------------------

/** Einzelner Cookie, wie ihn CDP zurückgibt / erwartet */
export interface CdpCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;      // Unix-Timestamp in Sekunden; -1 = Session-Cookie
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None' | 'Extended';
  priority?: 'Low' | 'Medium' | 'High';
  sameParty?: boolean;
  sourceScheme?: 'Unset' | 'NonSecure' | 'Secure';
  sourcePort?: number;
  partitionKey?: string;
}

/** Minimale CDP-Antwortstruktur */
interface CdpResponse<T = unknown> {
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: string };
}

/** CDP-Event-Nachricht (kein id, hat method + params) */
interface CdpEvent {
  method: string;
  params?: Record<string, unknown>;
}

/** Antwort von Network.getAllCookies */
interface GetAllCookiesResult {
  cookies: CdpCookie[];
}

/** Antwort von Network.setCookie */
interface SetCookieResult {
  success: boolean;
}

/** Antwort von Runtime.evaluate */
interface EvaluateResult {
  result: {
    type: string;
    value?: unknown;
    description?: string;
  };
  exceptionDetails?: {
    text: string;
    exception?: { description?: string };
  };
}

/** Antwort von Target.getTargets */
interface GetTargetsResult {
  targetInfos: Array<{
    targetId: string;
    type: string;
    title: string;
    url: string;
    attached: boolean;
  }>;
}

/** Format der gespeicherten Session-Datei */
interface SessionFile {
  exportedAt: string;          // ISO-8601
  profilePath: string;
  targetUrl: string;
  cookies: CdpCookie[];
}

/** Konfiguration für den SessionManager */
export interface SessionManagerConfig {
  /** CDP-Host (Standard: localhost) */
  cdpHost?: string;
  /** CDP-Port (Standard: 9222) */
  cdpPort?: number;
  /** Pfad zum persistenten Chrome-Profil */
  profilePath?: string;
  /** Ziel-URL der CRM-Anwendung */
  targetUrl?: string;
  /** Login-URL für Re-Login-Trigger */
  loginUrl?: string;
  /** Timeout für einzelne CDP-Befehle in ms (Standard: 15000) */
  commandTimeoutMs?: number;
  /** Anzahl Wiederholungsversuche bei CDP-Fehlern (Standard: 3) */
  maxRetries?: number;
}

// ---------------------------------------------------------------------------
// Reconnect-Konfiguration (Konstanten)
// ---------------------------------------------------------------------------

/** Maximale Anzahl automatischer Reconnect-Versuche in CdpWebSocket */
const WS_MAX_RECONNECT_ATTEMPTS = 10;

/** Basiswert für Exponential Backoff in ms */
const WS_BACKOFF_BASE_MS = 1_000;

/** Maximale Wartezeit zwischen Reconnect-Versuchen in ms */
const WS_BACKOFF_MAX_MS = 30_000;

// ---------------------------------------------------------------------------
// WebSocket-Minimal-Implementierung (ohne externe Abhängigkeit)
// ---------------------------------------------------------------------------

/**
 * Minimaler RFC-6455-WebSocket-Client (nur was CDP braucht).
 * Hält eine persistente Verbindung zum Chrome-DevTools-Endpunkt.
 *
 * Reconnect-Verhalten:
 *   - Bei 'close'- oder 'error'-Event wird automatisch neu verbunden
 *   - Exponential Backoff: 1s → 2s → 4s → … → max 30s
 *   - Nach WS_MAX_RECONNECT_ATTEMPTS Fehlschlägen wird 'reconnect_failed' emittiert
 *   - Alle ausstehenden Requests werden bei Verbindungsabbruch sofort abgebrochen
 *   - Bei erfolgreicher Verbindung wird der Zähler zurückgesetzt
 */
class CdpWebSocket extends EventEmitter {
  private socket: import('net').Socket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private connected = false;

  /** Zuletzt verwendete WebSocket-URL — wird für Reconnect benötigt */
  private lastWsUrl: string | null = null;

  /** Aktueller Reconnect-Versuchszähler (0 = keine laufenden Versuche) */
  private reconnectAttempts = 0;

  /** Verhindert parallele Reconnect-Schleifen */
  private isReconnecting = false;

  /** Ermöglicht das Abbrechen von Reconnect-Versuchen (z.B. bei close()) */
  private reconnectAborted = false;

  async connect(wsUrl: string): Promise<void> {
    this.lastWsUrl = wsUrl;
    this.reconnectAborted = false;
    return this.connectInternal(wsUrl);
  }

  /**
   * Interne Verbindungsaufbau-Logik — auch vom Reconnect-Mechanismus verwendet.
   * Trennt vorhandene Sockets sauber, bevor eine neue Verbindung aufgebaut wird.
   */
  private connectInternal(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Eventuell noch offenen Socket sauber schließen
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.destroy();
        this.socket = null;
      }
      this.buffer = Buffer.alloc(0);
      this.connected = false;

      const url = new URL(wsUrl);
      const net = require('net') as typeof import('net');

      this.socket = net.createConnection(
        { host: url.hostname, port: parseInt(url.port, 10) || 80 },
        () => {
          // HTTP-Upgrade-Handshake senden
          const key = Buffer.from(
            Math.random().toString(36).slice(2).padEnd(16, '0').slice(0, 16)
          ).toString('base64');

          const handshake = [
            `GET ${url.pathname}${url.search} HTTP/1.1`,
            `Host: ${url.host}`,
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Key: ${key}`,
            'Sec-WebSocket-Version: 13',
            '\r\n',
          ].join('\r\n');

          this.socket!.write(handshake);
        }
      );

      let headersDone = false;
      let upgradeOk = false;

      this.socket.on('data', (data: Buffer) => {
        if (!headersDone) {
          // HTTP-Response-Header auswerten
          const text = data.toString('utf8');
          if (text.includes('101 Switching Protocols')) {
            upgradeOk = true;
          }
          if (text.includes('\r\n\r\n')) {
            headersDone = true;
            if (!upgradeOk) {
              reject(new Error(`CDP-WebSocket-Handshake fehlgeschlagen:\n${text}`));
              return;
            }
            this.connected = true;
            // Zähler zurücksetzen — Verbindung erfolgreich hergestellt
            this.reconnectAttempts = 0;
            // Restliche Bytes nach den Headern gehören schon zum WS-Frame
            const afterHeaders = data.subarray(data.indexOf('\r\n\r\n') + 4);
            if (afterHeaders.length > 0) this.receiveData(afterHeaders);
            resolve();
          }
          return;
        }
        this.receiveData(data);
      });

      this.socket.on('error', (err: Error) => {
        if (!this.connected) {
          reject(err);
        } else {
          // Verbindung war aktiv — Reconnect einleiten
          this.connected = false;
          this.emit('error', err);
          this.scheduleReconnect();
        }
      });

      this.socket.on('close', () => {
        if (!this.connected) return; // Wurde bereits von 'error' behandelt
        this.connected = false;
        this.emit('close');
        this.scheduleReconnect();
      });
    });
  }

  /**
   * Plant den nächsten Reconnect-Versuch mit Exponential Backoff.
   * Ruft sich selbst rekursiv auf, bis die maximale Anzahl erreicht ist
   * oder die Verbindung erfolgreich wiederhergestellt wird.
   *
   * Backoff-Formel: min(baseMs * 2^attempt, maxMs)
   * Beispiel: 1s, 2s, 4s, 8s, 16s, 30s, 30s, 30s, …
   */
  private scheduleReconnect(): void {
    if (this.isReconnecting || this.reconnectAborted) return;

    this.isReconnecting = true;
    this.doReconnect().finally(() => {
      this.isReconnecting = false;
    });
  }

  private async doReconnect(): Promise<void> {
    if (!this.lastWsUrl) return;

    while (!this.reconnectAborted) {
      this.reconnectAttempts++;

      if (this.reconnectAttempts > WS_MAX_RECONNECT_ATTEMPTS) {
        const err = new Error(
          `[CdpWebSocket] Reconnect fehlgeschlagen nach ${WS_MAX_RECONNECT_ATTEMPTS} Versuchen.`
        );
        this.emit('reconnect_failed', err);
        return;
      }

      const delayMs = Math.min(
        WS_BACKOFF_BASE_MS * Math.pow(2, this.reconnectAttempts - 1),
        WS_BACKOFF_MAX_MS
      );

      this.emit('reconnecting', this.reconnectAttempts, delayMs);
      console.warn(
        `[CdpWebSocket] Reconnect-Versuch ${this.reconnectAttempts}/${WS_MAX_RECONNECT_ATTEMPTS} ` +
        `in ${delayMs}ms…`
      );

      await this.sleep(delayMs);

      if (this.reconnectAborted) break;

      try {
        await this.connectInternal(this.lastWsUrl);
        // Erfolg — connectInternal hat reconnectAttempts bereits auf 0 zurückgesetzt
        this.emit('reconnected');
        console.log('[CdpWebSocket] Reconnect erfolgreich.');
        return;
      } catch (err) {
        console.error(
          `[CdpWebSocket] Reconnect-Versuch ${this.reconnectAttempts} fehlgeschlagen:`,
          (err as Error).message
        );
        // Schleife läuft weiter → nächster Versuch
      }
    }
  }

  /** WebSocket-Frame(s) aus dem TCP-Strom lesen und reassemblieren */
  private receiveData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length >= 2) {
      // Byte 0: FIN + Opcode; Byte 1: MASK-Bit + Payload-Länge
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      const opcode = firstByte & 0x0f;
      const masked = (secondByte & 0x80) !== 0;

      let payloadLength = secondByte & 0x7f;
      let headerLength = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < 4) break; // noch nicht genug Daten
        payloadLength = this.buffer.readUInt16BE(2);
        headerLength = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) break;
        // 64-Bit-Länge — für CDP-Nachrichten reicht der 32-Bit-Teil
        payloadLength = this.buffer.readUInt32BE(6);
        headerLength = 10;
      }

      const maskingKeyLength = masked ? 4 : 0;
      const totalLength = headerLength + maskingKeyLength + payloadLength;

      if (this.buffer.length < totalLength) break; // Frame noch unvollständig

      const payload = this.buffer.subarray(
        headerLength + maskingKeyLength,
        totalLength
      );

      if (masked) {
        const maskKey = this.buffer.subarray(headerLength, headerLength + 4);
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      // Opcode 1 = Text-Frame, 8 = Connection-Close, 9 = Ping
      if (opcode === 1) {
        const text = payload.toString('utf8');
        try {
          const msg = JSON.parse(text);
          this.emit('message', msg);
        } catch {
          // Kein valides JSON — ignorieren
        }
      } else if (opcode === 9) {
        // Ping → Pong senden (Opcode 10)
        this.sendFrame(Buffer.alloc(0), 10);
      } else if (opcode === 8) {
        this.socket?.destroy();
      }

      this.buffer = this.buffer.subarray(totalLength);
    }
  }

  /** Unmasked Text-Frame senden (Server-zu-Server benötigt keine Maskierung laut Spec,
   *  aber Chrome erwartet als Client-Frame maskierte Daten) */
  send(data: string): void {
    const payload = Buffer.from(data, 'utf8');
    this.sendFrame(payload, 1);
  }

  private sendFrame(payload: Buffer, opcode: number): void {
    // Client-Frames MÜSSEN maskiert sein (RFC 6455, §5.3)
    const maskKey = Buffer.from([
      Math.random() * 256,
      Math.random() * 256,
      Math.random() * 256,
      Math.random() * 256,
    ].map(Math.floor));

    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) {
      masked[i] ^= maskKey[i % 4];
    }

    let header: Buffer;
    if (payload.length < 126) {
      header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(payload.length, 6);
    }

    this.socket?.write(Buffer.concat([header, maskKey, masked]));
  }

  get isConnected(): boolean {
    return this.connected;
  }

  close(): void {
    // Reconnect-Schleife abbrechen, damit kein Reconnect nach explizitem close() erfolgt
    this.reconnectAborted = true;

    // Ordentliches Close-Frame senden
    if (this.socket && this.connected) {
      this.sendFrame(Buffer.alloc(0), 8);
      this.socket.destroy();
    }
    this.connected = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Haupt-Klasse: SessionManager
// ---------------------------------------------------------------------------

/**
 * Verwaltet die CDP-Verbindung und Session-Zustand für crm.job-step.com.
 *
 * Events (extends EventEmitter):
 *   'reconnecting'     — wird vor jedem Reconnect-Versuch emittiert
 *                        Argumente: (attempt: number, delayMs: number)
 *   'reconnected'      — wird nach erfolgreichem Reconnect emittiert
 *   'reconnect_failed' — wird emittiert, wenn alle Versuche ausgeschöpft sind
 *                        Argumente: (error: Error)
 */
export class SessionManager extends EventEmitter {
  private readonly config: Required<SessionManagerConfig>;
  private ws: CdpWebSocket | null = null;
  private messageId = 1;

  // Ausstehende CDP-Anfragen: id → { resolve, reject }
  private pendingRequests = new Map<
    number,
    { resolve: (r: unknown) => void; reject: (e: Error) => void }
  >();

  /** Handle des laufenden Health-Check-Intervalls (null = kein aktiver Check) */
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  /** CDP-Event-Listener nach method-Namen (z.B. 'Page.javascriptDialogOpening') */
  private cdpEventListeners = new Map<string, Set<(params: unknown) => void>>();

  constructor(config: SessionManagerConfig = {}) {
    super(); // EventEmitter initialisieren
    this.config = {
      cdpHost: config.cdpHost ?? 'localhost',
      cdpPort: config.cdpPort ?? 9222,
      profilePath: config.profilePath ?? 'C:/Users/ds/.chrome-debug-profile',
      targetUrl: config.targetUrl ?? 'https://crm.job-step.com',
      loginUrl: config.loginUrl ?? 'https://crm.job-step.com/login',
      commandTimeoutMs: config.commandTimeoutMs ?? 15_000,
      maxRetries: config.maxRetries ?? 3,
    };
  }

  // -------------------------------------------------------------------------
  // Öffentliche API
  // -------------------------------------------------------------------------

  /**
   * Verbindet mit dem laufenden Chrome-Prozess über CDP.
   * Chrome muss mit --remote-debugging-port=9222 und
   * --user-data-dir=C:/Users/ds/.chrome-debug-profile gestartet worden sein.
   */
  async init(): Promise<void> {
    console.log('[SessionManager] Initialisierung...');
    console.log(`[SessionManager] Profil-Pfad: ${this.config.profilePath}`);
    console.log(`[SessionManager] CDP-Endpunkt: ${this.config.cdpHost}:${this.config.cdpPort}`);

    // Sicherstellen, dass das Profil-Verzeichnis existiert
    this.ensureProfileDirectory();

    // CDP-Verbindung aufbauen
    await this.connect();

    // Network-Domain aktivieren (Voraussetzung für Cookie-Operationen)
    await this.sendCommand('Network.enable', {});

    console.log('[SessionManager] Bereit. CDP-Verbindung aktiv.');
  }

  /**
   * Prüft, ob die aktuelle Session noch gültig ist.
   * Kriterien:
   *   - Es gibt mindestens ein gültiges Session-Cookie für crm.job-step.com
   *   - Die aktuelle Seite zeigt kein Login-Formular (DOM-Prüfung)
   */
  async isSessionValid(): Promise<boolean> {
    try {
      // Schritt 1: Cookie-Check
      const cookiesOk = await this.checkSessionCookies();
      if (!cookiesOk) {
        console.log('[SessionManager] Session ungültig: keine gültigen Cookies gefunden.');
        return false;
      }

      // Schritt 2: DOM-Prüfung — kein Login-Formular sichtbar?
      const domOk = await this.checkDomForLoginForm();
      if (!domOk) {
        console.log('[SessionManager] Session ungültig: Login-Formular im DOM entdeckt.');
        return false;
      }

      console.log('[SessionManager] Session gültig.');
      return true;
    } catch (err) {
      console.error('[SessionManager] Fehler bei Session-Prüfung:', (err as Error).message);
      return false;
    }
  }

  /**
   * Exportiert alle Cookies der aktuellen Session in eine JSON-Datei.
   * @param filePath Absoluter Pfad zur Ausgabedatei (z.B. ./session.json)
   */
  async exportSession(filePath: string): Promise<void> {
    console.log(`[SessionManager] Exportiere Session nach: ${filePath}`);

    try {
      const result = await this.sendCommand<GetAllCookiesResult>(
        'Network.getAllCookies',
        {}
      );

      // Nur Cookies für die CRM-Domain behalten — kein Datenmüll in der Exportdatei
      const crmDomain = new URL(this.config.targetUrl).hostname;
      const filteredCookies = result.cookies.filter(
        (c) =>
          c.domain === crmDomain ||
          c.domain === `.${crmDomain}` ||
          c.domain.endsWith(`.${crmDomain}`)
      );

      if (filteredCookies.length === 0) {
        console.warn('[SessionManager] Warnung: Keine CRM-Cookies zum Exportieren gefunden.');
      }

      const sessionFile: SessionFile = {
        exportedAt: new Date().toISOString(),
        profilePath: this.config.profilePath,
        targetUrl: this.config.targetUrl,
        cookies: filteredCookies,
      };

      // Verzeichnis anlegen falls nötig
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, JSON.stringify(sessionFile, null, 2), 'utf-8');
      console.log(
        `[SessionManager] ${filteredCookies.length} Cookie(s) exportiert nach: ${filePath}`
      );
    } catch (err) {
      throw new Error(
        `[SessionManager] Session-Export fehlgeschlagen: ${(err as Error).message}`
      );
    }
  }

  /**
   * Importiert Cookies aus einer exportierten Session-Datei.
   * Bereits vorhandene Cookies der Domain werden vorher gelöscht.
   * @param filePath Absoluter Pfad zur importierenden JSON-Datei
   */
  async importSession(filePath: string): Promise<void> {
    console.log(`[SessionManager] Importiere Session aus: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `[SessionManager] Session-Datei nicht gefunden: ${filePath}`
      );
    }

    let sessionFile: SessionFile;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      sessionFile = JSON.parse(raw) as SessionFile;
    } catch (err) {
      throw new Error(
        `[SessionManager] Session-Datei konnte nicht gelesen werden: ${(err as Error).message}`
      );
    }

    // Plausibilitätscheck: Stimmt die Ziel-URL überein?
    if (sessionFile.targetUrl !== this.config.targetUrl) {
      console.warn(
        `[SessionManager] Warnung: Exportierte URL (${sessionFile.targetUrl}) ` +
          `stimmt nicht mit Ziel-URL (${this.config.targetUrl}) überein.`
      );
    }

    // Alte Cookies der Domain entfernen
    await this.sendCommand('Network.clearBrowserCookies', {});
    console.log('[SessionManager] Vorhandene Cookies geleert.');

    // Cookies einzeln setzen (CDP erlaubt kein Batch-Set)
    let successCount = 0;
    for (const cookie of sessionFile.cookies) {
      try {
        // Abgelaufene Cookies überspringen (außer Session-Cookies mit expires=-1)
        if (cookie.expires > 0 && cookie.expires < Date.now() / 1000) {
          console.warn(
            `[SessionManager] Überspringe abgelaufenen Cookie: ${cookie.name} ` +
              `(abgelaufen: ${new Date(cookie.expires * 1000).toISOString()})`
          );
          continue;
        }

        const result = await this.sendCommand<SetCookieResult>(
          'Network.setCookie',
          {
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            expires: cookie.expires,
            httpOnly: cookie.httpOnly,
            secure: cookie.secure,
            ...(cookie.sameSite && { sameSite: cookie.sameSite }),
          }
        );

        if (result.success) {
          successCount++;
        } else {
          console.warn(
            `[SessionManager] Cookie konnte nicht gesetzt werden: ${cookie.name}`
          );
        }
      } catch (err) {
        console.error(
          `[SessionManager] Fehler beim Setzen von Cookie "${cookie.name}": ` +
            (err as Error).message
        );
      }
    }

    console.log(
      `[SessionManager] ${successCount}/${sessionFile.cookies.length} Cookie(s) importiert.`
    );

    // Seite neu laden, damit die neuen Cookies wirksam werden
    await this.sendCommand('Page.reload', { ignoreCache: true });
    console.log('[SessionManager] Seite neu geladen.');
  }

  /**
   * Gibt den konfigurierten Chrome-Profil-Pfad zurück.
   * Wird u.a. vom Chrome-Prozess-Starter verwendet.
   */
  getProfilePath(): string {
    return this.config.profilePath;
  }

  /**
   * Gibt ein CdpSession-kompatibles Adapter-Objekt zurück.
   * Ermöglicht die Nutzung von PopupHandler und anderen Modulen die
   * das CdpSession-Interface erwarten.
   */
  getCdpSession(): {
    send(method: string, params?: Record<string, unknown>): Promise<unknown>;
    on(event: string, listener: (params: unknown) => void): void;
    off(event: string, listener: (params: unknown) => void): void;
  } {
    return {
      send: (method: string, params?: Record<string, unknown>) =>
        this.sendCommand(method, params ?? {}),
      on: (event: string, listener: (params: unknown) => void) => {
        if (!this.cdpEventListeners.has(event)) {
          this.cdpEventListeners.set(event, new Set());
        }
        this.cdpEventListeners.get(event)!.add(listener);
      },
      off: (event: string, listener: (params: unknown) => void) => {
        this.cdpEventListeners.get(event)?.delete(listener);
      },
    };
  }

  /**
   * Trennt die CDP-Verbindung sauber und stoppt alle laufenden Hintergrundprozesse.
   */
  close(): void {
    this.stopHealthCheck();
    this.ws?.close();
    this.ws = null;
    console.log('[SessionManager] CDP-Verbindung geschlossen.');
  }

  // -------------------------------------------------------------------------
  // Watchdog / Health-Check
  // -------------------------------------------------------------------------

  /**
   * Startet einen periodischen Watchdog, der die Session- und Verbindungsgesundheit überwacht.
   *
   * Verhalten:
   *   - Ruft alle `intervalMs` Millisekunden `isSessionValid()` auf
   *   - Bei Verbindungsfehler (WebSocket nicht verbunden): versucht Reconnect via `connect()`
   *   - Bei Session-Ablauf (Login-Formular sichtbar / Cookies fehlen): ruft `triggerRelogin()` auf
   *   - Ist bereits ein Health-Check aktiv, wird der alte gestoppt und ein neuer gestartet
   *
   * @param intervalMs Intervall zwischen den Checks in Millisekunden (empfohlen: ≥ 10_000)
   */
  startHealthCheck(intervalMs: number): void {
    this.stopHealthCheck(); // Vorherigen Check stoppen, falls aktiv

    console.log(
      `[SessionManager] Health-Check gestartet (Intervall: ${intervalMs}ms).`
    );

    this.healthCheckTimer = setInterval(() => {
      void this.runHealthCheck();
    }, intervalMs);

    // Node.js soll den Prozess nicht am Leben halten, nur wegen des Timers
    if (this.healthCheckTimer.unref) {
      this.healthCheckTimer.unref();
    }
  }

  /**
   * Stoppt den laufenden Health-Check-Watchdog.
   * Ist kein Check aktiv, ist dies ein No-Op.
   */
  stopHealthCheck(): void {
    if (this.healthCheckTimer !== null) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      console.log('[SessionManager] Health-Check gestoppt.');
    }
  }

  /**
   * Führt einen einzelnen Health-Check-Zyklus aus.
   * Wird vom Intervall-Timer aufgerufen; kann auch manuell aufgerufen werden.
   *
   * Ablauf:
   *   1. Ist die WebSocket-Verbindung nicht aktiv → Reconnect
   *   2. isSessionValid() → bei false: triggerRelogin()
   */
  private async runHealthCheck(): Promise<void> {
    try {
      // Schritt 1: Verbindungsprüfung
      if (!this.ws || !this.ws.isConnected) {
        console.warn(
          '[SessionManager] Health-Check: WebSocket nicht verbunden — starte Reconnect…'
        );
        try {
          await this.connect();
          await this.sendCommand('Network.enable', {});
          console.log('[SessionManager] Health-Check: Reconnect erfolgreich.');
        } catch (err) {
          console.error(
            '[SessionManager] Health-Check: Reconnect fehlgeschlagen:',
            (err as Error).message
          );
          // Reconnect-Fehler wird nur geloggt — nächster Zyklus versucht es erneut
          return;
        }
      }

      // Schritt 2: Session-Validierung
      const valid = await this.isSessionValid();
      if (!valid) {
        console.warn(
          '[SessionManager] Health-Check: Session abgelaufen — starte Re-Login…'
        );
        await this.triggerRelogin();
      }
    } catch (err) {
      console.error(
        '[SessionManager] Health-Check: Unerwarteter Fehler:',
        (err as Error).message
      );
    }
  }

  // -------------------------------------------------------------------------
  // Session-Prüfungs-Hilfsmethoden
  // -------------------------------------------------------------------------

  /** Prüft, ob mindestens ein nicht-abgelaufenes Session-Cookie vorhanden ist */
  private async checkSessionCookies(): Promise<boolean> {
    const result = await this.sendCommand<GetAllCookiesResult>(
      'Network.getAllCookies',
      {}
    );

    const crmDomain = new URL(this.config.targetUrl).hostname;
    const now = Date.now() / 1000;

    const relevantCookies = result.cookies.filter(
      (c) =>
        (c.domain === crmDomain ||
          c.domain === `.${crmDomain}` ||
          c.domain.endsWith(`.${crmDomain}`)) &&
        // Session-Cookies (expires=-1) sind immer gültig solange Chrome läuft
        (c.expires === -1 || c.expires > now)
    );

    return relevantCookies.length > 0;
  }

  /**
   * Führt einen JavaScript-Snippet im aktiven Tab aus und prüft,
   * ob ein Login-Formular im DOM sichtbar ist.
   * Gibt true zurück, wenn KEIN Login-Formular gefunden wurde (Session ok).
   */
  private async checkDomForLoginForm(): Promise<boolean> {
    // Heuristik: Login-Formulare haben typischerweise input[type=password]
    // und/oder eine CSS-Klasse/ID mit "login" im Namen.
    const script = `
      (() => {
        const hasPasswordField = !!document.querySelector('input[type="password"]');
        const hasLoginClass =
          !!document.querySelector('[class*="login"]') ||
          !!document.querySelector('[id*="login"]') ||
          !!document.querySelector('[class*="signin"]') ||
          !!document.querySelector('[id*="signin"]');
        return hasPasswordField || hasLoginClass;
      })()
    `;

    try {
      const result = await this.sendCommand<EvaluateResult>('Runtime.evaluate', {
        expression: script,
        returnByValue: true,
      });

      if (result.exceptionDetails) {
        // JavaScript-Fehler beim Ausführen — defensiv: Session als ok annehmen
        console.warn(
          '[SessionManager] JS-Evaluierung fehlgeschlagen:',
          result.exceptionDetails.text
        );
        return true;
      }

      // true = Login-Formular vorhanden = Session NICHT ok → Negation zurückgeben
      const loginFormVisible = result.result.value as boolean;
      return !loginFormVisible;
    } catch {
      // Bei Verbindungsfehlern defensiv true zurückgeben
      return true;
    }
  }

  // -------------------------------------------------------------------------
  // Auto-Relogin
  // -------------------------------------------------------------------------

  /**
   * Löst einen Re-Login aus, indem zur Login-URL navigiert wird.
   * Kann von externen Modulen aufgerufen werden, wenn isSessionValid() false ergibt.
   *
   * HINWEIS: Die eigentliche Credential-Eingabe übernimmt ein separates Modul
   * (z.B. login-handler.ts). Diese Methode navigiert nur zur Login-Seite.
   */
  async triggerRelogin(): Promise<void> {
    console.log(
      `[SessionManager] Session abgelaufen — navigiere zur Login-URL: ${this.config.loginUrl}`
    );

    await this.sendCommand('Page.navigate', {
      url: this.config.loginUrl,
    });

    // Kurz warten, bis die Seite geladen ist
    await this.waitForPageLoad(10_000);

    console.log('[SessionManager] Login-Seite geladen. Bereit für Credential-Eingabe.');
  }

  // -------------------------------------------------------------------------
  // CDP-Infrastruktur
  // -------------------------------------------------------------------------

  /**
   * Baut die WebSocket-Verbindung zum ersten verfügbaren Page-Target auf.
   * Wiederholt den Versuch bis zu maxRetries Mal.
   *
   * Richtet zusätzlich die Event-Weiterleitungen für Reconnect-Events ein:
   *   - 'reconnecting'     → SessionManager emittiert 'reconnecting'
   *   - 'reconnected'      → SessionManager emittiert 'reconnected'
   *   - 'reconnect_failed' → SessionManager emittiert 'reconnect_failed'
   */
  private async connect(): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const wsUrl = await this.discoverWebSocketUrl();
        console.log(`[SessionManager] Verbinde mit Tab: ${wsUrl}`);

        // Alten WebSocket entfernen, falls vorhanden (z.B. beim Reconnect durch Health-Check)
        if (this.ws) {
          this.ws.removeAllListeners();
          this.ws.close();
        }

        this.ws = new CdpWebSocket();

        // Eingehende CDP-Nachrichten routen
        this.ws.on('message', (msg: CdpResponse) => {
          this.handleMessage(msg);
        });

        this.ws.on('error', (err: Error) => {
          console.error('[SessionManager] WebSocket-Fehler:', err.message);
        });

        this.ws.on('close', () => {
          console.warn('[SessionManager] WebSocket-Verbindung getrennt.');
          // Ausstehende Anfragen sofort abbrechen — kein endloses Warten
          this.abortPendingRequests(
            new Error('[SessionManager] WebSocket-Verbindung unerwartet geschlossen.')
          );
        });

        // Reconnect-Events von CdpWebSocket an SessionManager-Außenwelt weiterleiten
        this.ws.on('reconnecting', (attempt: number, delayMs: number) => {
          console.warn(
            `[SessionManager] WebSocket reconnecting (Versuch ${attempt}, Delay ${delayMs}ms)…`
          );
          // Pending-Requests beim Verbindungsabbruch abbrechen
          this.abortPendingRequests(
            new Error('[SessionManager] Verbindung unterbrochen — Reconnect läuft.')
          );
          this.emit('reconnecting', attempt, delayMs);
        });

        this.ws.on('reconnected', () => {
          console.log('[SessionManager] WebSocket reconnected.');
          this.emit('reconnected');
        });

        this.ws.on('reconnect_failed', (err: Error) => {
          console.error('[SessionManager] WebSocket-Reconnect endgültig fehlgeschlagen:', err.message);
          this.emit('reconnect_failed', err);
        });

        await this.ws.connect(wsUrl);
        return; // Erfolg
      } catch (err) {
        lastError = err as Error;
        console.warn(
          `[SessionManager] Verbindungsversuch ${attempt}/${this.config.maxRetries} fehlgeschlagen:`,
          lastError.message
        );
        if (attempt < this.config.maxRetries) {
          await this.sleep(1_000 * attempt); // Exponentiell warten
        }
      }
    }

    throw new Error(
      `[SessionManager] CDP-Verbindung nach ${this.config.maxRetries} Versuchen fehlgeschlagen. ` +
        `Ist Chrome mit --remote-debugging-port=${this.config.cdpPort} gestartet?\n` +
        `Letzter Fehler: ${lastError?.message}`
    );
  }

  /**
   * Fragt den CDP-HTTP-Endpunkt nach verfügbaren Tabs/Targets ab
   * und gibt die WebSocket-URL des ersten Page-Targets zurück.
   */
  private async discoverWebSocketUrl(): Promise<string> {
    const jsonUrl = `http://${this.config.cdpHost}:${this.config.cdpPort}/json`;

    const body = await this.httpGet(jsonUrl);
    let targets: Array<{
      type: string;
      webSocketDebuggerUrl: string;
      url: string;
      title: string;
    }>;

    try {
      targets = JSON.parse(body);
    } catch {
      throw new Error(
        `[SessionManager] Ungültige JSON-Antwort vom CDP-Endpunkt: ${body.slice(0, 200)}`
      );
    }

    // Bevorzuge den CRM-Tab, falls bereits geöffnet
    const crmTarget = targets.find(
      (t) =>
        t.type === 'page' &&
        t.url.startsWith(this.config.targetUrl)
    );

    // Ansonsten: ersten Page-Tab nehmen
    const pageTarget = targets.find((t) => t.type === 'page');
    const chosen = crmTarget ?? pageTarget;

    if (!chosen) {
      throw new Error(
        '[SessionManager] Kein Browser-Tab (type=page) im CDP-Endpunkt gefunden. ' +
          'Bitte einen Tab in Chrome öffnen.'
      );
    }

    if (!chosen.webSocketDebuggerUrl) {
      throw new Error(
        `[SessionManager] Gewähltes Target hat keine webSocketDebuggerUrl. Target: ${JSON.stringify(chosen)}`
      );
    }

    return chosen.webSocketDebuggerUrl;
  }

  /**
   * Sendet einen CDP-Befehl und wartet auf die Antwort.
   * @param method CDP-Methodenname (z.B. "Network.getAllCookies")
   * @param params Parameter-Objekt
   */
  private sendCommand<T = unknown>(
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.ws.isConnected) {
        reject(new Error(`[SessionManager] Kein aktiver WebSocket für Befehl: ${method}`));
        return;
      }

      const id = this.messageId++;
      const message = JSON.stringify({ id, method, params });

      // Timeout: Hängt der Befehl, wird die Anfrage abgebrochen
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(
            `[SessionManager] CDP-Befehl "${method}" hat nach ` +
              `${this.config.commandTimeoutMs}ms nicht geantwortet.`
          )
        );
      }, this.config.commandTimeoutMs);

      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result as T);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.ws.send(message);
    });
  }

  /** Verarbeitet eingehende CDP-Nachrichten und löst ausstehende Promises auf */
  private handleMessage(msg: CdpResponse & Partial<CdpEvent>): void {
    // CDP-Event (hat method, aber keine id) → an registrierte Listener weiterleiten
    if (msg.id === undefined) {
      if (msg.method) {
        const listeners = this.cdpEventListeners.get(msg.method);
        if (listeners) {
          for (const listener of listeners) {
            listener(msg.params ?? {});
          }
        }
      }
      return;
    }

    const pending = this.pendingRequests.get(msg.id);
    if (!pending) return;

    this.pendingRequests.delete(msg.id);

    if (msg.error) {
      pending.reject(
        new Error(
          `[SessionManager] CDP-Fehler (Code ${msg.error.code}): ${msg.error.message}` +
            (msg.error.data ? `\nDetails: ${msg.error.data}` : '')
        )
      );
    } else {
      pending.resolve(msg.result);
    }
  }

  /**
   * Bricht alle ausstehenden CDP-Requests mit dem angegebenen Fehler ab.
   * Wird bei Verbindungsabbruch und Reconnect aufgerufen, damit keine
   * Requests endlos auf eine Antwort warten.
   *
   * @param reason Fehler, der an alle wartenden Promises übergeben wird
   */
  private abortPendingRequests(reason: Error): void {
    if (this.pendingRequests.size === 0) return;

    console.warn(
      `[SessionManager] Breche ${this.pendingRequests.size} ausstehende Request(s) ab:`,
      reason.message
    );

    for (const [, { reject }] of this.pendingRequests) {
      reject(reason);
    }
    this.pendingRequests.clear();
  }

  // -------------------------------------------------------------------------
  // Hilfsmethoden
  // -------------------------------------------------------------------------

  /** Sicherstellen, dass das Chrome-Profil-Verzeichnis vorhanden ist */
  private ensureProfileDirectory(): void {
    if (!fs.existsSync(this.config.profilePath)) {
      fs.mkdirSync(this.config.profilePath, { recursive: true });
      console.log(
        `[SessionManager] Profil-Verzeichnis angelegt: ${this.config.profilePath}`
      );
    } else {
      console.log(
        `[SessionManager] Profil-Verzeichnis vorhanden: ${this.config.profilePath}`
      );
    }
  }

  /** Wartet darauf, dass die aktuelle Seite fertig geladen ist */
  private waitForPageLoad(timeoutMs = 10_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const onMessage = (msg: CdpResponse & { method?: string }) => {
        if (msg.method === 'Page.loadEventFired') {
          clearTimeout(timer);
          this.ws?.off('message', onMessage);
          resolve();
        }
      };

      const timer = setTimeout(() => {
        // Listener immer entfernen, auch im Timeout-Fall (Memory-Leak-Schutz)
        this.ws?.off('message', onMessage);
        reject(new Error('[SessionManager] Timeout beim Warten auf Seitenlade-Ereignis.'));
      }, timeoutMs);

      // Page-Domain für Ereignisse aktivieren
      this.sendCommand('Page.enable', {}).catch(() => { /* ignorieren */ });
      this.ws?.on('message', onMessage);
    });
  }

  /** Minimaler HTTP-GET ohne externe Abhängigkeiten */
  private httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      http
        .get(url, (res) => {
          let body = '';
          res.on('data', (chunk: string) => (body += chunk));
          res.on('end', () => resolve(body));
          res.on('error', reject);
        })
        .on('error', (err) => {
          reject(
            new Error(
              `[SessionManager] HTTP-GET fehlgeschlagen (${url}): ${err.message}\n` +
                `Ist Chrome mit --remote-debugging-port=${this.config.cdpPort} gestartet?`
            )
          );
        });
    });
  }

  /** Asynchrones Warten (ersetzt setTimeout in async-Kontexten) */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Chrome-Start-Hilfsfunktion (Convenience-Export)
// ---------------------------------------------------------------------------

/**
 * Generiert den Chrome-Startbefehl mit allen notwendigen Flags für CDP + Profil-Persistenz.
 * Das Ergebnis kann in einem externen Skript oder shell-Befehl verwendet werden.
 *
 * Typische Verwendung:
 *   const cmd = getChromeStartCommand();
 *   require('child_process').spawn(cmd.executable, cmd.args, { detached: true });
 */
export function getChromeStartCommand(config: SessionManagerConfig = {}): {
  executable: string;
  args: string[];
  fullCommand: string;
} {
  const profilePath =
    config.profilePath ?? 'C:/Users/ds/.chrome-debug-profile';
  const cdpPort = config.cdpPort ?? 9222;
  const targetUrl = config.targetUrl ?? 'https://crm.job-step.com';

  const executable =
    'C:/Program Files/Google/Chrome/Application/chrome.exe';

  const args = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profilePath}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',  // Hintergrund-Netzwerk-Aktivität reduzieren
    '--disable-sync',                   // Chrome-Sync deaktivieren (kein Google-Login nötig)
    '--disable-extensions',             // Extensions deaktivieren für Stabilität
    '--disable-popup-blocking',
    '--disable-notifications',
    targetUrl,
  ];

  return {
    executable,
    args,
    fullCommand: `"${executable}" ${args.map((a) => `"${a}"`).join(' ')}`,
  };
}

// ---------------------------------------------------------------------------
// Default-Export und Singleton-Factory
// ---------------------------------------------------------------------------

/**
 * Erstellt und initialisiert einen SessionManager mit Standard-Konfiguration.
 * Für einfache Use-Cases ohne manuelles Konfigurieren.
 */
export async function createSessionManager(
  config: SessionManagerConfig = {}
): Promise<SessionManager> {
  const manager = new SessionManager(config);
  await manager.init();
  return manager;
}

export default SessionManager;

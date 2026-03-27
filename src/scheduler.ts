/**
 * scheduler.ts
 * Scheduling-Modul für die CRM-Automatisierung (crm.job-step.com)
 *
 * Unterstützt zwei Scheduling-Strategien:
 *  1. Windows Task Scheduler (schtasks) – für systemweites, persistentes Scheduling
 *  2. node-cron                         – für In-Process-Scheduling ohne Admin-Rechte
 *
 * Windows 11 Build 26200 | node-cron@4 | TypeScript strict
 */

import { execSync, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as cron from 'node-cron';

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

/** Unterstützte Schedule-Typen */
export type ScheduleType = 'windows-task' | 'cron-job';

/** Persistenter Ausführungsstatus */
export type ExecutionStatus = 'success' | 'failure' | 'running' | 'retrying';

/** Ein einzelner Eintrag im Ausführungsprotokoll */
export interface ExecutionLog {
  /** Interner Task-Name */
  name: string;
  /** Startzeitpunkt (ISO 8601) */
  startedAt: string;
  /** Endzeitpunkt (ISO 8601) – undefined wenn noch laufend */
  finishedAt?: string;
  /** Ergebnisstatus */
  status: ExecutionStatus;
  /** Fehlermeldung bei Fehlschlag */
  error?: string;
  /** Wie oft wurde nach Fehlschlag neu versucht */
  retryCount: number;
  /** Dauer in Millisekunden */
  durationMs?: number;
}

/** Konfiguration eines registrierten Schedules */
export interface Schedule {
  /** Eindeutiger interner Name (wird auch als Windows-Taskname verwendet) */
  name: string;
  /** node-cron-Ausdruck, z.B. "0 8 * * *" */
  cronExpr: string;
  /** Art des Schedules */
  type: ScheduleType;
  /** Zeitstempel der Registrierung (ISO 8601) */
  registeredAt: string;
  /** Maximale Anzahl Wiederholungsversuche bei Fehlschlag */
  maxRetries: number;
  /** Wartezeit (ms) zwischen Wiederholungsversuchen */
  retryDelayMs: number;
  /** Pfad zum Skript (nur für windows-task) */
  scriptPath?: string;
  /** Funktion (nur für cron-job, nicht serialisierbar) */
  fn?: () => Promise<void>;
  /** node-cron Task-Handle (intern) */
  _cronHandle?: cron.ScheduledTask;
}

/** Optionen beim Registrieren eines Schedules */
export interface ScheduleOptions {
  /** Max. Wiederholungsversuche (Standard: 3) */
  maxRetries?: number;
  /** Pause zwischen Retries in ms (Standard: 30_000) */
  retryDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Bereinigt einen Tasknamen für Windows Task Scheduler.
 * Erlaubte Zeichen: Buchstaben, Zahlen, Bindestrich, Unterstrich.
 * Sonderzeichen und Leerzeichen werden durch "_" ersetzt.
 */
function sanitizeWindowsTaskName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_]/g, '_');
}

/**
 * Gibt die aktuelle Zeit als ISO-8601-String zurück.
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Wartet eine bestimmte Anzahl Millisekunden (Promise-basiert).
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Konvertiert einen node-cron-Ausdruck in schtasks-Parameter.
 *
 * Unterstützte Muster (vereinfacht für praxisübliche CRM-Jobs):
 *   "0 H * * *"          → täglich um H:00 Uhr
 *   "0 H * * D"          → wöchentlich an Wochentag D (0=So, 1=Mo …)
 *   "0 H 1 * *" o.ä.    → monatlich (Fallback: täglich)
 *   "* * * * *"          → minütlich (Fallback: stündlich per MINUTE)
 *
 * Für komplexe Ausdrücke empfiehlt sich cron-job statt windows-task.
 */
function cronToSchtasksArgs(cronExpr: string): { schedule: string; modifier?: string; day?: string; startTime: string } {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Ungültiger cron-Ausdruck: "${cronExpr}" (erwartet 5 Felder)`);
  }

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  // Stündlich: "0 * * * *" oder "*/N * * * *"
  if (hour === '*' || hour.startsWith('*/')) {
    const interval = hour.startsWith('*/') ? hour.slice(2) : '1';
    return { schedule: 'HOURLY', modifier: interval, startTime: `00:${minute.padStart(2, '0')}` };
  }

  const startTime = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;

  // Wöchentlich: Wochentag ist gesetzt (0–7, Einzelwert oder Bereich wie "1-5")
  if (dayOfWeek !== '*') {
    const dowMap: Record<string, string> = {
      '0': 'SUN', '7': 'SUN',
      '1': 'MON', '2': 'TUE', '3': 'WED',
      '4': 'THU', '5': 'FRI', '6': 'SAT',
    };

    // Bereichsausdruck "A-B" expandieren (z.B. "1-5" → MON,TUE,WED,THU,FRI)
    const rangeMatch = /^(\d)-(\d)$/.exec(dayOfWeek);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1], 10);
      const to   = parseInt(rangeMatch[2], 10);
      const days = Array.from({ length: to - from + 1 }, (_, i) => dowMap[String(from + i)] ?? '')
        .filter(Boolean)
        .join(',');
      return { schedule: 'WEEKLY', day: days || 'MON', startTime };
    }

    const day = dowMap[dayOfWeek] ?? 'MON';
    return { schedule: 'WEEKLY', day, startTime };
  }

  // Täglich (Standard)
  if (dayOfMonth === '*') {
    return { schedule: 'DAILY', modifier: '1', startTime };
  }

  // Monatlich – schtasks unterstützt MONTHLY; Vereinfachung: täglich starten
  return { schedule: 'DAILY', modifier: '1', startTime };
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/** Einfacher Datei-Logger für Scheduling-Events */
class SchedulerLogger {
  private readonly logPath: string;

  constructor(logDir: string) {
    // Logverzeichnis sicherstellen (Windows-Pfad kompatibel)
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logPath = path.join(logDir, 'scheduler.log');
  }

  /** Schreibt eine Zeile mit Timestamp ins Log */
  write(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
    const line = `[${nowIso()}] [${level}] ${message}\n`;
    // Append-Modus – thread-unsicher aber für sequentiellen Betrieb ausreichend
    fs.appendFileSync(this.logPath, line, 'utf8');
    // Konsole spiegeln für unbeaufsichtigten Betrieb
    if (level === 'ERROR') {
      console.error(line.trim());
    } else {
      console.log(line.trim());
    }
  }

  info(msg: string): void  { this.write('INFO', msg); }
  warn(msg: string): void  { this.write('WARN', msg); }
  error(msg: string): void { this.write('ERROR', msg); }
}

// ---------------------------------------------------------------------------
// Benachrichtigung bei Fehlern
// ---------------------------------------------------------------------------

/**
 * Sendet eine Fehlerbenachrichtigung.
 * Erweiterbar: E-Mail, Slack, Windows-Ereignisprotokoll etc.
 * Aktuell: lokale Protokollierung + optionale Windows-Ereignis-Log-Einschreibung.
 */
function notifyFailure(name: string, error: string, logger: SchedulerLogger): void {
  logger.error(`FEHLER in Task "${name}": ${error}`);

  // Windows Ereignisprotokoll – schlägt still fehl wenn kein Admin
  try {
    const safeName = name.replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 100);
    const safeMsg = error.replace(/"/g, "'").replace(/[\r\n]/g, ' ').slice(0, 500);
    execSync(
      `eventcreate /T ERROR /ID 100 /L APPLICATION /SO CrmAutomation /D "Task '${safeName}' fehlgeschlagen: ${safeMsg}"`,
      { stdio: 'ignore', timeout: 5000 }
    );
  } catch {
    // Kein Admin-Fehler ignorieren
  }
}

// ---------------------------------------------------------------------------
// CrmScheduler
// ---------------------------------------------------------------------------

export class CrmScheduler {
  private readonly schedules: Map<string, Schedule> = new Map();
  private readonly executionLog: ExecutionLog[] = [];
  private readonly logger: SchedulerLogger;

  /** Maximale Einträge im In-Memory-Protokoll */
  private readonly maxLogEntries: number = 1000;

  /** Namen der Tasks die gerade aktiv ausgeführt werden */
  private readonly runningJobs: Set<string> = new Set();

  constructor(logDir: string = 'C:\\Users\\ds\\crm-automation\\logs') {
    this.logger = new SchedulerLogger(logDir);
    this.logger.info('CrmScheduler initialisiert.');
  }

  // -------------------------------------------------------------------------
  // Öffentliche API
  // -------------------------------------------------------------------------

  /**
   * Registriert einen Windows-Task über schtasks.exe.
   *
   * @param name      Eindeutiger Taskname (Sonderzeichen werden bereinigt)
   * @param script    Absoluter Pfad zum auszuführenden Node/TS-Skript
   * @param cronExpr  node-cron-Ausdruck (wird in schtasks-Parameter konvertiert)
   * @param options   Optionale Retry-Konfiguration
   */
  scheduleWindowsTask(
    name: string,
    script: string,
    cronExpr: string,
    options: ScheduleOptions = {}
  ): void {
    const safeName = sanitizeWindowsTaskName(name);
    const maxRetries = options.maxRetries ?? 3;
    const retryDelayMs = options.retryDelayMs ?? 30_000;

    // Bereits registrierten Task entfernen (Idempotenz)
    if (this.schedules.has(name)) {
      this.removeSchedule(name);
    }

    // Skriptpfad normalisieren – Windows benötigt Backslashes
    const winScript = path.resolve(script).replace(/\//g, '\\');

    // schtasks-Parameter aus cron-Ausdruck ableiten
    const schtasksArgs = cronToSchtasksArgs(cronExpr);

    // Kommando zusammenbauen
    // Hinweis: node.exe muss im PATH sein; ts-node für .ts-Dateien
    const nodeExe = winScript.endsWith('.ts') ? 'ts-node' : 'node';
    // /TR-Wert: innere Anführungszeichen mit \" escapen, damit CMD.EXE das Argument
    // korrekt als einen Token parst (schtasks /Create /TR "\"exe\" \"arg\"")
    const runCmd = `\\"${nodeExe}\\" \\"${winScript}\\"`;

    // /TR muss in äußeren Anführungszeichen stehen; innere mit \" escapet (CMD-Konvention)
    let cmd =
      `schtasks /Create /F /TN "CRM\\${safeName}" /TR "${runCmd}" /SC ${schtasksArgs.schedule}`;

    if (schtasksArgs.modifier) cmd += ` /MO ${schtasksArgs.modifier}`;
    if (schtasksArgs.day)      cmd += ` /D ${schtasksArgs.day}`;
    if (schtasksArgs.startTime) cmd += ` /ST ${schtasksArgs.startTime}`;

    // Task beim nächsten Login des aktuellen Benutzers ausführen
    // /RU "" bedeutet: aktueller Benutzer (ohne Passwort-Eingabe)
    cmd += ' /RL LIMITED';

    try {
      this.logger.info(`Windows-Task registrieren: schtasks /Create ... /TN "CRM\\${safeName}"`);
      execSync(cmd, { stdio: 'pipe', timeout: 15_000, windowsHide: true });
      this.logger.info(`Windows-Task "${safeName}" erfolgreich registriert.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Windows-Task "${safeName}" konnte nicht registriert werden: ${msg}`);
      throw new Error(`schtasks fehlgeschlagen: ${msg}`);
    }

    const schedule: Schedule = {
      name,
      cronExpr,
      type: 'windows-task',
      registeredAt: nowIso(),
      maxRetries,
      retryDelayMs,
      scriptPath: winScript,
    };

    this.schedules.set(name, schedule);
    this.logger.info(`Schedule "${name}" (windows-task) gespeichert.`);
  }

  /**
   * Registriert einen In-Process-Cron-Job mit node-cron.
   *
   * @param name      Eindeutiger Name
   * @param fn        Async-Funktion die ausgeführt wird
   * @param cronExpr  Standard-node-cron-Ausdruck
   * @param options   Optionale Retry-Konfiguration
   */
  scheduleCronJob(
    name: string,
    fn: () => Promise<void>,
    cronExpr: string,
    options: ScheduleOptions = {}
  ): void {
    const maxRetries = options.maxRetries ?? 3;
    const retryDelayMs = options.retryDelayMs ?? 30_000;

    if (!cron.validate(cronExpr)) {
      throw new Error(`Ungültiger cron-Ausdruck für "${name}": "${cronExpr}"`);
    }

    // Vorhandenen Job stoppen (Idempotenz)
    if (this.schedules.has(name)) {
      this.removeSchedule(name);
    }

    // Wrapper mit Logging, Retry und Fehlerbenachrichtigung
    const wrappedFn = this.buildWrappedFn(name, fn, maxRetries, retryDelayMs);

    const handle = cron.schedule(cronExpr, wrappedFn, {
      // 'scheduled: true' in node-cron v4 entfernt — Tasks starten jetzt standardmässig sofort
      timezone: 'Europe/Berlin', // Sicherstellen dass CRM-Jobs zur richtigen Ortszeit laufen
    });

    const schedule: Schedule = {
      name,
      cronExpr,
      type: 'cron-job',
      registeredAt: nowIso(),
      maxRetries,
      retryDelayMs,
      fn,
      _cronHandle: handle,
    };

    this.schedules.set(name, schedule);
    this.logger.info(`Schedule "${name}" (cron-job, "${cronExpr}") registriert.`);
  }

  /**
   * Entfernt einen Schedule (Windows-Task oder Cron-Job).
   * Wirft keinen Fehler wenn der Name nicht bekannt ist.
   */
  removeSchedule(name: string): void {
    const schedule = this.schedules.get(name);

    if (!schedule) {
      this.logger.warn(`removeSchedule: "${name}" nicht gefunden – ignoriert.`);
      return;
    }

    if (schedule.type === 'cron-job' && schedule._cronHandle) {
      schedule._cronHandle.stop();
      this.logger.info(`Cron-Job "${name}" gestoppt.`);
    }

    if (schedule.type === 'windows-task') {
      const safeName = sanitizeWindowsTaskName(name);
      try {
        execSync(`schtasks /Delete /F /TN "CRM\\${safeName}"`, {
          stdio: 'pipe',
          timeout: 10_000,
          windowsHide: true,
        });
        this.logger.info(`Windows-Task "${safeName}" aus Task Scheduler entfernt.`);
      } catch (err: unknown) {
        // Nicht fatal – Task existiert vielleicht bereits nicht mehr
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Windows-Task "${safeName}" konnte nicht gelöscht werden: ${msg}`);
      }
    }

    this.schedules.delete(name);
    this.logger.info(`Schedule "${name}" entfernt.`);
  }

  /**
   * Gibt alle registrierten Schedules zurück.
   * Interne Felder (_cronHandle, fn) werden herausgefiltert.
   */
  listSchedules(): Schedule[] {
    return Array.from(this.schedules.values()).map(({ _cronHandle, fn, ...rest }) => rest);
  }

  /**
   * Führt einen registrierten Schedule sofort aus (manuell auslösen).
   * Für Windows-Tasks wird schtasks /Run genutzt.
   * Für Cron-Jobs wird die hinterlegte Funktion direkt aufgerufen.
   */
  async runNow(name: string): Promise<void> {
    const schedule = this.schedules.get(name);

    if (!schedule) {
      throw new Error(`runNow: Schedule "${name}" nicht gefunden.`);
    }

    this.logger.info(`runNow: "${name}" wird sofort ausgeführt.`);

    if (schedule.type === 'windows-task') {
      const safeName = sanitizeWindowsTaskName(name);
      return new Promise<void>((resolve, reject) => {
        exec(
          `schtasks /Run /TN "CRM\\${safeName}"`,
          { timeout: 30_000, windowsHide: true },
          (error, stdout, stderr) => {
            if (error) {
              const msg = stderr || error.message;
              this.logger.error(`runNow Windows-Task "${name}" fehlgeschlagen: ${msg}`);
              reject(new Error(msg));
            } else {
              this.logger.info(`runNow Windows-Task "${name}" gestartet: ${stdout.trim()}`);
              resolve();
            }
          }
        );
      });
    }

    // Cron-Job: direkt ausführen mit vollem Retry-Handling
    if (schedule.fn) {
      await this.buildWrappedFn(name, schedule.fn, schedule.maxRetries, schedule.retryDelayMs)();
    } else {
      throw new Error(`runNow: Cron-Job "${name}" hat keine hinterlegte Funktion.`);
    }
  }

  /**
   * Gibt das Ausführungsprotokoll zurück (neueste Einträge zuerst).
   */
  getExecutionLog(): ExecutionLog[] {
    return [...this.executionLog].reverse();
  }

  /**
   * Gibt zurück ob ein Cron-Job mit dem angegebenen Namen gerade aktiv ausgeführt wird.
   *
   * @param name  Interner Task-Name
   */
  isRunning(name: string): boolean {
    return this.runningJobs.has(name);
  }

  /**
   * Graceful Shutdown: Stoppt alle Cron-Jobs, wartet auf laufende Tasks (max. 5s),
   * schreibt ein finales SHUTDOWN-Log und löscht alle Windows-Tasks der CRM-Gruppe.
   *
   * Jeder Schritt wird einzeln mit try/catch abgesichert – ein Fehler in einem
   * Schritt bricht den Shutdown nicht ab.
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutdown eingeleitet.');

    // ── Schritt 1: Alle Cron-Jobs stoppen ──────────────────────────────────
    try {
      for (const [name, schedule] of this.schedules.entries()) {
        if (schedule.type === 'cron-job' && schedule._cronHandle) {
          try {
            schedule._cronHandle.stop();
            // node-cron v4: destroy() optional vorhanden — entfernt interne Timer falls verfügbar
            const handle = schedule._cronHandle as cron.ScheduledTask & {
              destroy?: () => void;
            };
            if (typeof handle.destroy === 'function') {
              handle.destroy();
            }
            this.logger.info(`Shutdown: Cron-Job "${name}" gestoppt.`);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Shutdown: Cron-Job "${name}" konnte nicht sauber gestoppt werden: ${msg}`);
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Shutdown Schritt 1 (Cron-Jobs stoppen) fehlgeschlagen: ${msg}`);
    }

    // ── Schritt 2: Auf laufende Tasks warten (max. 5 Sekunden) ─────────────
    try {
      const shutdownDeadlineMs = 5_000;
      const pollIntervalMs = 100;
      const deadline = Date.now() + shutdownDeadlineMs;

      if (this.runningJobs.size > 0) {
        this.logger.info(
          `Shutdown: Warte auf ${this.runningJobs.size} laufende Task(s): [${[...this.runningJobs].join(', ')}]`
        );

        while (this.runningJobs.size > 0 && Date.now() < deadline) {
          await sleep(pollIntervalMs);
        }

        if (this.runningJobs.size > 0) {
          this.logger.warn(
            `Shutdown: Timeout (${shutdownDeadlineMs}ms) – ${this.runningJobs.size} Task(s) noch aktiv: [${[...this.runningJobs].join(', ')}]`
          );
        } else {
          this.logger.info('Shutdown: Alle Tasks abgeschlossen.');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Shutdown Schritt 2 (Warten auf Tasks) fehlgeschlagen: ${msg}`);
    }

    // ── Schritt 3: Finales SHUTDOWN-Log schreiben ───────────────────────────
    try {
      this.logger.info('SHUTDOWN');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Shutdown Schritt 3 (Log schreiben) fehlgeschlagen: ${msg}`);
    }

    // ── Schritt 4: Alle Windows-Tasks der CRM-Gruppe löschen ────────────────
    try {
      // Alle Tasks unter \CRM\ via schtasks /Query auflisten und dann löschen.
      // /Delete /F /TN "CRM\" löscht den Ordner und alle enthaltenen Tasks.
      execSync('schtasks /Delete /F /TN "CRM"', {
        stdio: 'pipe',
        timeout: 15_000,
        windowsHide: true,
      });
      this.logger.info('Shutdown: Windows-Task-Gruppe "CRM" vollständig gelöscht.');
    } catch (err: unknown) {
      // Nicht fatal – Gruppe könnte leer oder bereits gelöscht sein
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Shutdown Schritt 4 (Windows-Tasks löschen) fehlgeschlagen (ggf. keine Tasks vorhanden): ${msg}`);
    }
  }

  // -------------------------------------------------------------------------
  // Interne Hilfsmethoden
  // -------------------------------------------------------------------------

  /**
   * Erstellt einen Wrapper um die eigentliche Task-Funktion mit:
   *  - Ausführungsprotokollierung (Start, Ende, Status, Dauer)
   *  - Konfigurierbarem Retry-Mechanismus bei Fehlschlag
   *  - Fehlerbenachrichtigung nach letztem Fehlschlag
   */
  private buildWrappedFn(
    name: string,
    fn: () => Promise<void>,
    maxRetries: number,
    retryDelayMs: number
  ): () => Promise<void> {
    return async (): Promise<void> => {
      const startedAt = nowIso();
      const startMs = Date.now();

      // Log-Eintrag anlegen
      const logEntry: ExecutionLog = {
        name,
        startedAt,
        status: 'running',
        retryCount: 0,
      };
      this.pushLog(logEntry);
      this.runningJobs.add(name);

      this.logger.info(`Task "${name}" gestartet.`);

      let lastError: Error | null = null;

      try {
        // Retry-Schleife
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          if (attempt > 0) {
            logEntry.status = 'retrying';
            logEntry.retryCount = attempt;
            this.logger.warn(
              `Task "${name}": Wiederholungsversuch ${attempt}/${maxRetries} nach ${retryDelayMs}ms...`
            );
            await sleep(retryDelayMs);
          }

          try {
            await fn();
            // Erfolg
            logEntry.status = 'success';
            logEntry.finishedAt = nowIso();
            logEntry.durationMs = Date.now() - startMs;
            delete logEntry.error;
            this.logger.info(
              `Task "${name}" erfolgreich abgeschlossen (${logEntry.durationMs}ms).`
            );
            return;
          } catch (err: unknown) {
            lastError = err instanceof Error ? err : new Error(String(err));
            this.logger.warn(
              `Task "${name}" Versuch ${attempt + 1} fehlgeschlagen: ${lastError.message}`
            );
          }
        }

        // Alle Versuche erschöpft
        logEntry.status = 'failure';
        logEntry.finishedAt = nowIso();
        logEntry.durationMs = Date.now() - startMs;
        logEntry.error = lastError?.message ?? 'Unbekannter Fehler';
        notifyFailure(name, logEntry.error, this.logger);
      } finally {
        this.runningJobs.delete(name);
      }
    };
  }

  /**
   * Fügt einen Log-Eintrag hinzu und begrenzt die Puffergröße.
   * Mutations am zurückgegebenen Objekt sind möglich (Referenz).
   */
  private pushLog(entry: ExecutionLog): void {
    this.executionLog.push(entry);
    // Älteste Einträge verwerfen um Speicherverbrauch zu begrenzen
    if (this.executionLog.length > this.maxLogEntries) {
      this.executionLog.splice(0, this.executionLog.length - this.maxLogEntries);
    }
  }
}

// ---------------------------------------------------------------------------
// Vordefinierte cron-Ausdrücke (Convenience-Konstanten)
// ---------------------------------------------------------------------------

export const SCHEDULE = {
  /** Täglich um 08:00 Uhr */
  DAILY_8AM:       '0 8 * * *',
  /** Täglich um 06:00 Uhr */
  DAILY_6AM:       '0 6 * * *',
  /** Stündlich zur vollen Stunde */
  HOURLY:          '0 * * * *',
  /** Alle 30 Minuten */
  EVERY_30MIN:     '*/30 * * * *',
  /** Montags um 09:00 Uhr */
  WEEKLY_MON_9AM:  '0 9 * * 1',
  /** Werktags (Mo–Fr) um 08:00 Uhr */
  WEEKDAYS_8AM:    '0 8 * * 1-5',
} as const;

// ---------------------------------------------------------------------------
// Singleton-Export für einfache Nutzung im Projekt
// ---------------------------------------------------------------------------

/** Globaler Scheduler – wird einmalig instanziiert */
export const scheduler = new CrmScheduler();

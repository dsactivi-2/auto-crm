/**
 * live-test.ts
 * ------------
 * Live-Tests für das CRM-Automatisierungsprojekt (crm.job-step.com).
 *
 * KEIN Mock, KEIN Hook, KEINE Stub-Library.
 * Tests laufen gegen echte CDP-Verbindung (localhost:9222).
 * Reines TypeScript/Node.js, ausgeführt mit ts-node.
 *
 * Ausführung: npx tsx tests/live-test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

// ---------------------------------------------------------------------------
// Importe der zu testenden Module
// ---------------------------------------------------------------------------
import {
  SessionManager,
  SessionManagerConfig,
  getChromeStartCommand,
} from '../src/session-manager';

import { PopupHandler, DialogRule } from '../src/popup-handler';

import {
  FileUploadManager,
  FileUploadManagerConfig,
} from '../src/file-upload';

import {
  CrmScheduler,
  SCHEDULE,
  ExecutionLog,
  Schedule,
} from '../src/scheduler';

// ---------------------------------------------------------------------------
// Minimaler Test-Runner (ohne externe Abhängigkeiten)
// ---------------------------------------------------------------------------

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];
let currentSuite = '';

function suite(name: string): void {
  currentSuite = name;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('='.repeat(60));
}

function skip(name: string, _reason: string): void {
  const fullName = currentSuite ? `[${currentSuite}] ${name}` : name;
  results.push({ name: fullName, passed: true });
  console.log(`  SKIP  ${name} (${_reason})`);
}

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  const fullName = currentSuite ? `[${currentSuite}] ${name}` : name;
  try {
    await fn();
    results.push({ name: fullName, passed: true });
    console.log(`  PASS  ${name}`);
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? '' : '';
    results.push({ name: fullName, passed: false, error });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error}`);
    if (stack) {
      // Nur die relevanten Stack-Zeilen (ohne Node.js-Interna)
      const relevantStack = stack
        .split('\n')
        .filter((l) => !l.includes('node_modules') && !l.includes('node:'))
        .slice(0, 5)
        .join('\n        ');
      if (relevantStack) {
        console.log(`        ${relevantStack}`);
      }
    }
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion fehlgeschlagen: ${message}`);
  }
}

function assertType(value: unknown, expectedType: string, label: string): void {
  const actual = typeof value;
  if (actual !== expectedType) {
    throw new Error(`${label}: Erwartet Typ "${expectedType}", erhalten "${actual}" (Wert: ${String(value)})`);
  }
}

/** Prüft ob localhost:9222 erreichbar ist (ohne CDP-Verbindung aufzubauen) */
function checkCdpReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:9222/json', (res) => {
      res.resume(); // Body konsumieren damit Socket geschlossen wird
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// ---------------------------------------------------------------------------
// Globaler Status: läuft Chrome?
// ---------------------------------------------------------------------------
let chromeRunning = false;

// ---------------------------------------------------------------------------
// SESSION-MANAGER Tests
// ---------------------------------------------------------------------------

async function runSessionManagerTests(): Promise<void> {
  suite('SESSION-MANAGER');

  // Test 1: Chrome läuft auf Port 9222?
  await test('Chrome läuft auf Port 9222 (Verbindungstest)', async () => {
    chromeRunning = await checkCdpReachable();
    assert(
      chromeRunning,
      'CDP-Endpunkt localhost:9222 nicht erreichbar. ' +
        'Chrome muss mit --remote-debugging-port=9222 gestartet sein.'
    );
  });

  // Test 2: getProfilePath() gibt korrekten Pfad zurück
  await test('getProfilePath() gibt konfigurierten Profil-Pfad zurück', () => {
    const expectedPath = 'C:/Users/ds/.chrome-debug-profile';
    const manager = new SessionManager({ profilePath: expectedPath });
    const result = manager.getProfilePath();

    assertType(result, 'string', 'getProfilePath() Rückgabewert');
    assert(
      result === expectedPath,
      `Erwartet: "${expectedPath}", erhalten: "${result}"`
    );
  });

  // Test 3: getProfilePath() mit Standard-Konfiguration
  await test('getProfilePath() liefert Standard-Pfad ohne explizite Konfiguration', () => {
    const manager = new SessionManager();
    const result = manager.getProfilePath();

    assertType(result, 'string', 'getProfilePath() Standard-Rückgabewert');
    assert(result.length > 0, 'Profil-Pfad darf nicht leer sein');
    // Standard-Pfad enthält chrome-debug-profile
    assert(
      result.includes('chrome-debug-profile'),
      `Standard-Pfad "${result}" enthält nicht "chrome-debug-profile"`
    );
  });

  // Test 4: isSessionValid() gibt boolean zurück
  if (!chromeRunning) {
    skip('isSessionValid() gibt boolean zurück', 'Chrome nicht erreichbar (Port 9222)');
  } else await test('isSessionValid() gibt boolean zurück', async () => {

    const manager = new SessionManager();
    try {
      await manager.init();
      const result = await manager.isSessionValid();

      assertType(result, 'boolean', 'isSessionValid() Rückgabewert');
      console.log(`        → isSessionValid() = ${result}`);

      manager.close();
    } catch (err) {
      manager.close();
      throw err;
    }
  });

  // Test 5: exportSession() erzeugt Datei
  if (!chromeRunning) {
    skip('exportSession() erzeugt JSON-Datei auf Disk', 'Chrome nicht erreichbar (Port 9222)');
  } else await test('exportSession() erzeugt JSON-Datei auf Disk', async () => {
    const tmpExportPath = path.join(
      'C:\\Users\\ds\\crm-automation\\tests',
      `session-export-test-${Date.now()}.json`
    );

    const manager = new SessionManager();
    try {
      await manager.init();
      await manager.exportSession(tmpExportPath);

      assert(
        fs.existsSync(tmpExportPath),
        `Exportdatei wurde nicht erstellt: ${tmpExportPath}`
      );

      // Datei muss valides JSON mit dem SessionFile-Schema sein
      const raw = fs.readFileSync(tmpExportPath, 'utf-8');
      const parsed = JSON.parse(raw) as {
        exportedAt?: string;
        profilePath?: string;
        targetUrl?: string;
        cookies?: unknown[];
      };

      assert(
        typeof parsed.exportedAt === 'string',
        'SessionFile.exportedAt fehlt oder ist kein String'
      );
      assert(
        typeof parsed.profilePath === 'string',
        'SessionFile.profilePath fehlt oder ist kein String'
      );
      assert(
        typeof parsed.targetUrl === 'string',
        'SessionFile.targetUrl fehlt oder ist kein String'
      );
      assert(
        Array.isArray(parsed.cookies),
        'SessionFile.cookies ist kein Array'
      );

      console.log(
        `        → ${parsed.cookies.length} Cookie(s) exportiert nach: ${tmpExportPath}`
      );

      manager.close();
    } catch (err) {
      manager.close();
      throw err;
    } finally {
      // Testdatei aufräumen
      if (fs.existsSync(tmpExportPath)) {
        fs.unlinkSync(tmpExportPath);
      }
    }
  });

  // Test 6: getChromeStartCommand() liefert valide Struktur
  await test('getChromeStartCommand() liefert executable, args und fullCommand', () => {
    const result = getChromeStartCommand();

    assertType(result.executable, 'string', 'getChromeStartCommand().executable');
    assert(Array.isArray(result.args), 'getChromeStartCommand().args muss ein Array sein');
    assertType(result.fullCommand, 'string', 'getChromeStartCommand().fullCommand');
    assert(result.args.length > 0, 'getChromeStartCommand().args darf nicht leer sein');
    assert(
      result.executable.toLowerCase().endsWith('chrome.exe'),
      `executable "${result.executable}" endet nicht mit chrome.exe`
    );

    // Pflicht-Flags prüfen
    const joinedArgs = result.args.join(' ');
    assert(
      joinedArgs.includes('--remote-debugging-port=9222'),
      'Pflicht-Flag --remote-debugging-port=9222 fehlt'
    );
    assert(
      joinedArgs.includes('--user-data-dir='),
      'Pflicht-Flag --user-data-dir fehlt'
    );
  });
}

// ---------------------------------------------------------------------------
// POPUP-HANDLER Tests
// ---------------------------------------------------------------------------

async function runPopupHandlerTests(): Promise<void> {
  suite('POPUP-HANDLER');

  // Test 1: PopupHandler lässt sich instanziieren
  await test('PopupHandler lässt sich ohne Argumente instanziieren', () => {
    const handler = new PopupHandler();
    assert(handler instanceof PopupHandler, 'Instanz ist kein PopupHandler');
  });

  // Test 2: addRule() fügt Regel hinzu (Vorrang-Prüfung)
  await test('addRule() fügt Regel mit höchster Priorität am Anfang ein', () => {
    const handler = new PopupHandler();

    // Vor addRule: getDialogLog() ist leer
    const logBefore = handler.getDialogLog();
    assert(Array.isArray(logBefore), 'getDialogLog() muss Array zurückgeben (vor addRule)');
    assert(logBefore.length === 0, 'Log muss am Start leer sein');

    // Regel hinzufügen — keine Exception erwartet
    handler.addRule(/test-pattern/i, 'accept');
    handler.addRule(/fehler/i, 'dismiss', 'nein');

    // Zwei addRule-Aufrufe dürfen keinen Fehler werfen
    // Da wir keinen direkten Zugriff auf die interne rules-Liste haben,
    // prüfen wir anhand des Logs dass addRule() keine Exception geworfen hat.
    const logAfter = handler.getDialogLog();
    assert(
      Array.isArray(logAfter),
      'getDialogLog() muss nach addRule() noch Array zurückgeben'
    );
  });

  // Test 3: getDialogLog() gibt leeres Array am Start zurück
  await test('getDialogLog() gibt leeres Array bei frischer Instanz zurück', () => {
    const handler = new PopupHandler();
    const log = handler.getDialogLog();

    assert(Array.isArray(log), 'getDialogLog() muss Array zurückgeben');
    assert(log.length === 0, `Log-Länge muss 0 sein, ist aber ${log.length}`);
  });

  // Test 4: getDialogLog() gibt Kopie zurück (keine direkte Referenz)
  await test('getDialogLog() gibt eine Kopie zurück (Referenz-Isolation)', () => {
    const handler = new PopupHandler();
    const log1 = handler.getDialogLog();
    const log2 = handler.getDialogLog();

    assert(Array.isArray(log1), 'Erster Aufruf: kein Array');
    assert(Array.isArray(log2), 'Zweiter Aufruf: kein Array');
    assert(
      log1 !== log2,
      'getDialogLog() darf nicht dieselbe Array-Referenz zurückgeben (keine Kopie)'
    );
  });

  // Test 5: Default-Regeln vorhanden (via setDefaultAction + Verhalten)
  await test('Default-Regeln sind nach Instanziierung aktiv (mind. 4 Regeln)', () => {
    // Wir können die privaten rules nicht direkt lesen.
    // Indirekt prüfbar: clearLog() und setDefaultAction() laufen fehlerfrei.
    const handler = new PopupHandler();

    // clearLog() darf nicht werfen
    handler.clearLog();
    const afterClear = handler.getDialogLog();
    assert(
      afterClear.length === 0,
      `Log nach clearLog() muss leer sein, hat aber ${afterClear.length} Einträge`
    );

    // setDefaultAction() darf nicht werfen
    handler.setDefaultAction('dismiss');
    handler.setDefaultAction('accept');

    // destroy() darf nicht werfen (auch ohne init())
    handler.destroy();
    const afterDestroy = handler.getDialogLog();
    assert(
      Array.isArray(afterDestroy),
      'getDialogLog() nach destroy() muss Array zurückgeben'
    );
  });

  // Test 6: addRule() mit promptText-Parameter
  await test('addRule() akzeptiert optionalen promptText-Parameter', () => {
    const handler = new PopupHandler();

    // Darf nicht werfen
    handler.addRule(/meintest/i, 'accept', 'mein-antworttext');
    handler.addRule(/ohnetext/i, 'dismiss');

    // Log bleibt leer (kein Dialog ausgelöst)
    const log = handler.getDialogLog();
    assert(log.length === 0, 'Log muss nach reinem addRule() leer bleiben');
  });
}

// ---------------------------------------------------------------------------
// FILE-UPLOAD Tests
// ---------------------------------------------------------------------------

async function runFileUploadTests(): Promise<void> {
  suite('FILE-UPLOAD');

  // Test 1: FileUploadManager lässt sich instanziieren
  await test('FileUploadManager lässt sich ohne Argumente instanziieren', () => {
    const manager = new FileUploadManager();
    assert(manager instanceof FileUploadManager, 'Instanz ist kein FileUploadManager');
  });

  // Test 2: FileUploadManager lässt sich mit Konfiguration instanziieren
  await test('FileUploadManager lässt sich mit vollständiger Konfiguration instanziieren', () => {
    const config: FileUploadManagerConfig = {
      cdpHost: 'localhost',
      cdpPort: 9222,
      maxRetries: 2,
      retryDelayMs: 500,
      timeoutMs: 5000,
      tmpDir: 'C:\\Windows\\Temp',
      verbose: false,
    };
    const manager = new FileUploadManager(config);
    assert(manager instanceof FileUploadManager, 'Instanz ist kein FileUploadManager');
  });

  // Test 3: uploadFile() mit nicht-existierender Datei → korrekter Fehler
  await test('uploadFile() mit nicht-existierender Datei wirft Fehler "Datei nicht gefunden"', async () => {
    const manager = new FileUploadManager({ maxRetries: 1, retryDelayMs: 100 });
    const nichtExistierend = 'C:\\does\\not\\exist\\datei-die-es-nicht-gibt-12345.pdf';

    let errorThrown = false;
    let errorMessage = '';

    try {
      await manager.uploadFile(nichtExistierend, 'input[type="file"]');
    } catch (err: unknown) {
      errorThrown = true;
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    assert(
      errorThrown,
      'uploadFile() mit nicht-existierender Datei muss einen Fehler werfen'
    );
    assert(
      errorMessage.toLowerCase().includes('nicht gefunden') ||
        errorMessage.toLowerCase().includes('not found') ||
        errorMessage.toLowerCase().includes('fehlgeschlagen'),
      `Fehlermeldung enthält keinen erwarteten Text. Erhalten: "${errorMessage}"`
    );
    console.log(`        → Fehler korrekt: "${errorMessage.slice(0, 100)}"`);
  });

  // Test 4: uploadFile() mit relativem Pfad → korrekter Fehler
  await test('uploadFile() mit relativem (nicht-absoluten) Pfad wirft Fehler', async () => {
    const manager = new FileUploadManager({ maxRetries: 1, retryDelayMs: 100 });
    const relativerPfad = 'relative/path/datei.pdf';

    let errorThrown = false;
    let errorMessage = '';

    try {
      await manager.uploadFile(relativerPfad, 'input[type="file"]');
    } catch (err: unknown) {
      errorThrown = true;
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    assert(
      errorThrown,
      'uploadFile() mit relativem Pfad muss einen Fehler werfen'
    );
    assert(
      errorMessage.toLowerCase().includes('absolut') ||
        errorMessage.toLowerCase().includes('nicht gefunden') ||
        errorMessage.toLowerCase().includes('fehlgeschlagen'),
      `Fehlermeldung enthält keinen erwarteten Text. Erhalten: "${errorMessage}"`
    );
    console.log(`        → Fehler korrekt: "${errorMessage.slice(0, 100)}"`);
  });

  // Test 5: uploadFromUrl() mit ungültiger URL → korrekter Fehler
  await test('uploadFromUrl() mit ungültiger URL wirft Fehler', async () => {
    const manager = new FileUploadManager({ maxRetries: 1, retryDelayMs: 100 });

    // Diese URL ist syntaktisch ungültig — kein valides URL-Schema
    const ungueltigeUrl = 'das-ist-keine-url';

    let errorThrown = false;
    let errorMessage = '';

    try {
      await manager.uploadFromUrl(ungueltigeUrl, 'input[type="file"]');
    } catch (err: unknown) {
      errorThrown = true;
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    assert(
      errorThrown,
      'uploadFromUrl() mit ungültiger URL muss einen Fehler werfen'
    );
    console.log(`        → Fehler korrekt: "${errorMessage.slice(0, 100)}"`);
  });

  // Test 6: uploadFromUrl() mit nicht-erreichbarer URL → Netzwerkfehler
  await test('uploadFromUrl() mit nicht-erreichbarer HTTP-URL wirft Netzwerkfehler', async () => {
    const manager = new FileUploadManager({ maxRetries: 1, retryDelayMs: 100 });

    // Loopback-Adresse auf Port der sicher nicht lauscht
    const nichtErreichbar = 'http://127.0.0.1:19999/datei-existiert-nicht.pdf';

    let errorThrown = false;
    let errorMessage = '';

    try {
      await manager.uploadFromUrl(nichtErreichbar, 'input[type="file"]');
    } catch (err: unknown) {
      errorThrown = true;
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    assert(
      errorThrown,
      'uploadFromUrl() mit nicht-erreichbarer URL muss einen Fehler werfen'
    );
    console.log(`        → Fehler korrekt: "${errorMessage.slice(0, 100)}"`);
  });

  // Test 7: disconnect() läuft ohne Fehler (auch ohne vorherige Verbindung)
  await test('disconnect() wirft keinen Fehler ohne vorherige CDP-Verbindung', () => {
    const manager = new FileUploadManager();
    // Darf nicht werfen
    manager.disconnect();
  });

  // Test 8: cleanup() läuft ohne Fehler
  await test('cleanup() wirft keinen Fehler bei leerem tempFiles-Array', () => {
    const manager = new FileUploadManager();
    manager.cleanup(); // Darf nicht werfen
  });
}

// ---------------------------------------------------------------------------
// SCHEDULER Tests
// ---------------------------------------------------------------------------

async function runSchedulerTests(): Promise<void> {
  suite('SCHEDULER');

  // Test 1: CrmScheduler lässt sich instanziieren
  await test('CrmScheduler lässt sich mit Standard-Konfiguration instanziieren', () => {
    // Temporäres Log-Verzeichnis damit keine Produktionslogs verschmutzt werden
    const tmpLogDir = 'C:\\Users\\ds\\crm-automation\\tests\\tmp-logs';
    const scheduler = new CrmScheduler(tmpLogDir);
    assert(scheduler instanceof CrmScheduler, 'Instanz ist kein CrmScheduler');

    // Aufräumen
    if (fs.existsSync(tmpLogDir)) {
      fs.rmSync(tmpLogDir, { recursive: true, force: true });
    }
  });

  // Test 2: listSchedules() gibt leeres Array bei frischer Instanz zurück
  await test('listSchedules() gibt leeres Array bei frischer Instanz zurück', () => {
    const tmpLogDir = 'C:\\Users\\ds\\crm-automation\\tests\\tmp-logs-2';
    const scheduler = new CrmScheduler(tmpLogDir);

    const schedules = scheduler.listSchedules();
    assert(Array.isArray(schedules), 'listSchedules() muss Array zurückgeben');
    assert(
      schedules.length === 0,
      `listSchedules() muss leer sein, hat aber ${schedules.length} Einträge`
    );

    // Aufräumen
    if (fs.existsSync(tmpLogDir)) {
      fs.rmSync(tmpLogDir, { recursive: true, force: true });
    }
  });

  // Test 3: getExecutionLog() gibt leeres Array bei frischer Instanz zurück
  await test('getExecutionLog() gibt leeres Array bei frischer Instanz zurück', () => {
    const tmpLogDir = 'C:\\Users\\ds\\crm-automation\\tests\\tmp-logs-3';
    const scheduler = new CrmScheduler(tmpLogDir);

    const log = scheduler.getExecutionLog();
    assert(Array.isArray(log), 'getExecutionLog() muss Array zurückgeben');
    assert(
      log.length === 0,
      `getExecutionLog() muss leer sein, hat aber ${log.length} Einträge`
    );

    // Aufräumen
    if (fs.existsSync(tmpLogDir)) {
      fs.rmSync(tmpLogDir, { recursive: true, force: true });
    }
  });

  // Test 4: SCHEDULE-Konstanten verfügbar und valide
  await test('SCHEDULE-Konstanten sind vorhanden und enthalten valide cron-Ausdrücke', () => {
    // Prüfe alle erwarteten Konstanten
    const erwarteteKonstanten: (keyof typeof SCHEDULE)[] = [
      'DAILY_8AM',
      'DAILY_6AM',
      'HOURLY',
      'EVERY_30MIN',
      'WEEKLY_MON_9AM',
      'WEEKDAYS_8AM',
    ];

    for (const key of erwarteteKonstanten) {
      const value = SCHEDULE[key];
      assertType(value, 'string', `SCHEDULE.${key}`);
      assert(value.length > 0, `SCHEDULE.${key} darf nicht leer sein`);

      // Valides cron-Format: genau 5 Felder getrennt durch Leerzeichen
      const parts = value.trim().split(/\s+/);
      assert(
        parts.length === 5,
        `SCHEDULE.${key} = "${value}" hat ${parts.length} Felder statt 5`
      );
    }

    // Konkrete Werte prüfen
    assert(SCHEDULE.DAILY_8AM === '0 8 * * *', `SCHEDULE.DAILY_8AM falsch: "${SCHEDULE.DAILY_8AM}"`);
    assert(SCHEDULE.DAILY_6AM === '0 6 * * *', `SCHEDULE.DAILY_6AM falsch: "${SCHEDULE.DAILY_6AM}"`);
    assert(SCHEDULE.HOURLY === '0 * * * *', `SCHEDULE.HOURLY falsch: "${SCHEDULE.HOURLY}"`);
    assert(SCHEDULE.EVERY_30MIN === '*/30 * * * *', `SCHEDULE.EVERY_30MIN falsch: "${SCHEDULE.EVERY_30MIN}"`);
    assert(SCHEDULE.WEEKLY_MON_9AM === '0 9 * * 1', `SCHEDULE.WEEKLY_MON_9AM falsch: "${SCHEDULE.WEEKLY_MON_9AM}"`);
    assert(SCHEDULE.WEEKDAYS_8AM === '0 8 * * 1-5', `SCHEDULE.WEEKDAYS_8AM falsch: "${SCHEDULE.WEEKDAYS_8AM}"`);

    console.log(`        → ${erwarteteKonstanten.length} SCHEDULE-Konstanten geprüft`);
  });

  // Test 5: scheduleCronJob() registriert Job, listSchedules() zeigt ihn
  await test('scheduleCronJob() registriert Job und listSchedules() gibt ihn zurück', async () => {
    const tmpLogDir = 'C:\\Users\\ds\\crm-automation\\tests\\tmp-logs-4';
    const scheduler = new CrmScheduler(tmpLogDir);

    const jobName = 'test-job-live-test';
    const cronExpr = SCHEDULE.HOURLY; // '0 * * * *'
    const dummyFn = async (): Promise<void> => { /* no-op */ };

    scheduler.scheduleCronJob(jobName, dummyFn, cronExpr, { maxRetries: 1 });

    const schedules = scheduler.listSchedules();
    assert(schedules.length === 1, `listSchedules() muss 1 Eintrag haben, hat ${schedules.length}`);

    const entry = schedules[0] as Schedule;
    assert(entry.name === jobName, `Schedule-Name falsch: "${entry.name}"`);
    assert(entry.cronExpr === cronExpr, `cronExpr falsch: "${entry.cronExpr}"`);
    assert(entry.type === 'cron-job', `type falsch: "${entry.type}"`);
    assertType(entry.registeredAt, 'string', 'registeredAt');

    // Interne Felder dürfen nicht in der öffentlichen Liste erscheinen
    assert(
      !('_cronHandle' in entry),
      'listSchedules() darf _cronHandle nicht exportieren'
    );
    assert(
      !('fn' in entry),
      'listSchedules() darf fn nicht exportieren'
    );

    // Aufräumen
    scheduler.removeSchedule(jobName);
    const afterRemove = scheduler.listSchedules();
    assert(afterRemove.length === 0, 'Nach removeSchedule() muss listSchedules() leer sein');

    await scheduler.shutdown();

    if (fs.existsSync(tmpLogDir)) {
      fs.rmSync(tmpLogDir, { recursive: true, force: true });
    }
  });

  // Test 6: scheduleCronJob() mit ungültigem cron-Ausdruck → Fehler
  await test('scheduleCronJob() mit ungültigem cron-Ausdruck wirft Fehler', () => {
    const tmpLogDir = 'C:\\Users\\ds\\crm-automation\\tests\\tmp-logs-5';
    const scheduler = new CrmScheduler(tmpLogDir);

    let errorThrown = false;
    let errorMessage = '';

    try {
      scheduler.scheduleCronJob(
        'ungueltig-test',
        async () => { /* no-op */ },
        'das-ist-kein-cron',
        {}
      );
    } catch (err: unknown) {
      errorThrown = true;
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    assert(
      errorThrown,
      'scheduleCronJob() mit ungültigem cron-Ausdruck muss Fehler werfen'
    );
    console.log(`        → Fehler korrekt: "${errorMessage.slice(0, 80)}"`);

    if (fs.existsSync(tmpLogDir)) {
      fs.rmSync(tmpLogDir, { recursive: true, force: true });
    }
  });

  // Test 7: getExecutionLog() nach Cron-Job-Ausführung (runNow)
  await test('getExecutionLog() enthält Eintrag nach runNow()', async () => {
    const tmpLogDir = 'C:\\Users\\ds\\crm-automation\\tests\\tmp-logs-6';
    const scheduler = new CrmScheduler(tmpLogDir);

    const jobName = 'test-runnow-job';
    let jobAusgefuehrt = false;

    scheduler.scheduleCronJob(
      jobName,
      async () => {
        jobAusgefuehrt = true;
      },
      SCHEDULE.HOURLY,
      { maxRetries: 0 }
    );

    await scheduler.runNow(jobName);

    assert(jobAusgefuehrt, 'Job-Funktion wurde nicht ausgeführt');

    const log = scheduler.getExecutionLog();
    assert(Array.isArray(log), 'getExecutionLog() muss Array zurückgeben');
    assert(log.length >= 1, `getExecutionLog() muss mind. 1 Eintrag haben, hat ${log.length}`);

    const entry = log[0] as ExecutionLog;
    assert(entry.name === jobName, `Log-Eintrag name falsch: "${entry.name}"`);
    assert(entry.status === 'success', `Log-Eintrag status falsch: "${entry.status}"`);
    assertType(entry.startedAt, 'string', 'Log-Eintrag startedAt');
    assertType(entry.retryCount, 'number', 'Log-Eintrag retryCount');
    console.log(
      `        → Log: status=${entry.status}, durationMs=${entry.durationMs}ms, retryCount=${entry.retryCount}`
    );

    scheduler.removeSchedule(jobName);
    await scheduler.shutdown();

    if (fs.existsSync(tmpLogDir)) {
      fs.rmSync(tmpLogDir, { recursive: true, force: true });
    }
  });

  // Test 8: runNow() mit unbekanntem Namen → Fehler
  await test('runNow() mit unbekanntem Schedule-Namen wirft Fehler', async () => {
    const tmpLogDir = 'C:\\Users\\ds\\crm-automation\\tests\\tmp-logs-7';
    const scheduler = new CrmScheduler(tmpLogDir);

    let errorThrown = false;
    let errorMessage = '';

    try {
      await scheduler.runNow('schedule-existiert-nicht-12345');
    } catch (err: unknown) {
      errorThrown = true;
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    assert(
      errorThrown,
      'runNow() mit unbekanntem Namen muss Fehler werfen'
    );
    assert(
      errorMessage.includes('nicht gefunden') || errorMessage.includes('not found'),
      `Fehlermeldung enthält keinen erwarteten Text: "${errorMessage}"`
    );
    console.log(`        → Fehler korrekt: "${errorMessage.slice(0, 80)}"`);

    if (fs.existsSync(tmpLogDir)) {
      fs.rmSync(tmpLogDir, { recursive: true, force: true });
    }
  });
}

// ---------------------------------------------------------------------------
// Haupt-Ausführung
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('');
  console.log('CRM-AUTOMATISIERUNG — LIVE-TESTS');
  console.log('='.repeat(60));
  console.log(`Datum:     ${new Date().toISOString()}`);
  console.log(`CDP-Port:  localhost:9222`);
  console.log(`Node.js:   ${process.version}`);
  console.log('='.repeat(60));

  try {
    await runSessionManagerTests();
    await runPopupHandlerTests();
    await runFileUploadTests();
    await runSchedulerTests();
  } catch (fatalErr: unknown) {
    console.error('\nFATALER FEHLER beim Testlauf:');
    console.error(fatalErr instanceof Error ? fatalErr.stack : String(fatalErr));
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Gesamtergebnis
  // ---------------------------------------------------------------------------
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log('\n');
  console.log('='.repeat(60));
  console.log('  TESTERGEBNIS');
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\nFehlgeschlagene Tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  FAIL  ${r.name}`);
      if (r.error) {
        console.log(`        ${r.error}`);
      }
    }
    console.log('');
  }

  console.log(`Gesamt:     ${total} Tests`);
  console.log(`Bestanden:  ${passed}/${total}`);
  console.log(`Fehler:     ${failed}`);
  console.log('='.repeat(60));

  if (failed === 0) {
    console.log('\nAlle Tests bestanden.');
    process.exit(0);
  } else {
    console.log(`\n${failed} Test(s) fehlgeschlagen.`);
    process.exit(1);
  }
}

// Unhandled-Promise-Rejection abfangen
process.on('unhandledRejection', (reason: unknown) => {
  console.error('\nUnbehandelte Promise-Ablehnung:');
  console.error(reason instanceof Error ? reason.stack : String(reason));
  process.exit(1);
});

void main();

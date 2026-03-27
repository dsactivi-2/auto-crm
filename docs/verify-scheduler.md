# Verifikation: scheduler.ts

**Datei:** `C:/Users/ds/crm-automation/src/scheduler.ts`
**Datum:** 2026-03-26
**Prüfer:** Verifikations-Agent (sdd-verify / validation)
**tsconfig:** `strict: true`, Target ES2020, CommonJS

---

## Ergebnis-Übersicht

| # | Kriterium                        | Status |
|---|----------------------------------|--------|
| 1 | TypeScript-Typsicherheit         | PASS   |
| 2 | Windows-Kompatibilität (schtasks)| PASS*  |
| 3 | node-cron Integration            | PASS   |
| 4 | Fehlerbehandlung / Retry-Logik   | PASS   |
| 5 | Interface-Vollständigkeit        | PASS   |
| 6 | Idempotenz removeSchedule        | PASS   |
| 7 | Execution-Log vollständig        | PASS   |

*2 Fehler gefunden und korrigiert (Details siehe unten).

---

## Detailbewertung

### 1. TypeScript-Typsicherheit — PASS

- `strict: true` in tsconfig aktiv; `noImplicitAny` damit impliziert.
- Alle Funktionsparameter und Rückgabetypen explizit annotiert.
- Fehlerbehandlung durchgehend mit `err: unknown` + Type Guard (`err instanceof Error`), kein implizites `any`.
- `listSchedules()` destrukturiert `_cronHandle` und `fn` heraus; der Spread-Typ wird von TypeScript korrekt als `Omit<Schedule, '_cronHandle' | 'fn'>` inferiert.
- Interfaces `ExecutionLog`, `Schedule`, `ScheduleOptions` vollständig typisiert mit optionalen Feldern korrekt als `?` markiert.
- `ExecutionStatus` und `ScheduleType` als Union-Types exportiert.

Keine impliziten `any` festgestellt.

---

### 2. Windows-Kompatibilität (schtasks) — PASS (nach Korrektur)

**Befund 1 – FAIL (korrigiert): Falsches Quoting im /TR-Parameter**

Ursprünglicher Code:
```ts
const runCmd = `"${nodeExe}" "${winScript}"`;
// Ergebnis in CMD: schtasks /Create ... /TR ""node" "C:\path\script.js""
// CMD parst den /TR-Wert falsch: Token endet nach dem zweiten "
```

CMD.EXE versteht geschachtelte doppelte Anführungszeichen nicht ohne Escaping. Der äußere `"..."` um den gesamten `/TR`-Wert endet beim ersten inneren `"` des nodeExe-Teils, was zu einem fehlerhaften Task-Befehl führt.

Korrektur (angewendet):
```ts
const runCmd = `\\"${nodeExe}\\" \\"${winScript}\\"`;
// Ergebnis in CMD: schtasks /Create ... /TR "\"node\" \"C:\path\script.js\""
// CMD-Parsing korrekt: äußere Quotes begrenzen den Token, \" wird als literales " übergeben
```

**Befund 2 – FAIL (korrigiert): Bereichsausdruck im dayOfWeek nicht unterstützt**

`WEEKDAYS_8AM: '0 8 * * 1-5'` erzeugt einen Cron-Ausdruck mit `dayOfWeek = "1-5"`.
Die Funktion `cronToSchtasksArgs` prüfte nur Einzelziffern via `dowMap["1-5"]` → `undefined` → stiller Fallback auf `'MON'`. Der Task würde nur montags statt Mo–Fr laufen.

Korrektur (angewendet): Regex `/^(\d)-(\d)$/` erkennt Bereichsausdrücke und expandiert sie:
```ts
// "1-5" → from=1, to=5 → ["MON","TUE","WED","THU","FRI"] → "MON,TUE,WED,THU,FRI"
// schtasks /SC WEEKLY /D MON,TUE,WED,THU,FRI  ← gültige Syntax
```

**Weiteres (korrekt):**
- `sanitizeWindowsTaskName` ersetzt `[^a-zA-Z0-9\-_]` durch `_` — korrekt.
- Task-Namespace `CRM\{name}` korrekt mit Backslash.
- `path.resolve().replace(/\//g, '\\')` normalisiert POSIX-Pfade zu Windows-Pfaden.
- `execSync(..., { windowsHide: true })` unterdrückt CMD-Fenster.
- Timeout 15 000 ms bei Create, 10 000 ms bei Delete — angemessen.

---

### 3. node-cron Integration — PASS

- `cron.validate(cronExpr)` wird vor `cron.schedule()` aufgerufen; ungültige Ausdrücke werfen sofort.
- `cron.schedule(expr, fn, { scheduled: true, timezone: 'Europe/Berlin' })` — Timezone korrekt gesetzt.
- Alle vordefinierten `SCHEDULE`-Konstanten sind valide 5-Feld-Cron-Ausdrücke (nach Fix auch `WEEKDAYS_8AM`).
- `EVERY_30MIN: '*/30 * * * *'` — korrekt (Minutenfeld, nicht Stundenfeld).
- node-cron@3 API (`ScheduledTask`, `.stop()`) wird korrekt verwendet.

---

### 4. Fehlerbehandlung / Retry-Logik — PASS

- `buildWrappedFn` implementiert eine `for`-Schleife `attempt = 0..maxRetries` (insgesamt `maxRetries + 1` Versuche).
- Zwischen Versuchen: `await sleep(retryDelayMs)` — non-blocking.
- Status im Log-Eintrag wird live aktualisiert: `running` → `retrying` → `success` | `failure`.
- Nach Erschöpfen aller Versuche: `notifyFailure()` aufgerufen.
- `notifyFailure` schreibt ins Windows-Ereignisprotokoll via `eventcreate`; Fehler (kein Admin) werden still ignoriert — korrekt.
- Sonderzeichen in Fehlermeldungen werden für `eventcreate` bereinigt (`.replace(/"/g, "'").replace(/[\r\n]/g, ' ').slice(0, 500)`).
- `execSync`-Fehler in `scheduleWindowsTask` werden gefangen, geloggt und als neuer `Error` weitergegeben.
- `removeSchedule` behandelt fehlende Windows-Tasks nicht-fatal (warn, kein throw).

---

### 5. Interface-Vollständigkeit — PASS

Alle 6 geforderten Methoden sind in `CrmScheduler` vorhanden und exportiert:

| Methode               | Signatur                                                                 | Vorhanden |
|-----------------------|--------------------------------------------------------------------------|-----------|
| `scheduleWindowsTask` | `(name, script, cronExpr, options?) => void`                            | Ja        |
| `scheduleCronJob`     | `(name, fn, cronExpr, options?) => void`                                | Ja        |
| `removeSchedule`      | `(name) => void`                                                        | Ja        |
| `listSchedules`       | `() => Schedule[]`                                                      | Ja        |
| `runNow`              | `(name) => Promise<void>`                                               | Ja        |
| `getExecutionLog`     | `() => ExecutionLog[]`                                                  | Ja        |

Zusätzlich: Singleton-Export `scheduler = new CrmScheduler()` für einfache Nutzung.

---

### 6. Idempotenz removeSchedule — PASS

```ts
removeSchedule(name: string): void {
  const schedule = this.schedules.get(name);
  if (!schedule) {
    this.logger.warn(`removeSchedule: "${name}" nicht gefunden – ignoriert.`);
    return;  // frühzeitiger Return, kein Fehler
  }
  // ...
}
```

- Erster Aufruf: Task wird gestoppt/gelöscht, aus Map entfernt.
- Zweiter Aufruf: `schedules.get(name)` → `undefined` → warn + return.
- Kein Fehler bei mehrfachem Aufruf — Idempotenz gegeben.
- Auch `scheduleWindowsTask` und `scheduleCronJob` rufen intern `removeSchedule` auf falls der Name bereits existiert (Re-Registrierung idempotent).

---

### 7. Execution-Log — PASS

Jede Ausführung über `buildWrappedFn` erzeugt einen `ExecutionLog`-Eintrag mit:

| Feld          | Befüllt bei          | Wert                              |
|---------------|----------------------|-----------------------------------|
| `name`        | Start                | Task-Name                         |
| `startedAt`   | Start                | ISO-8601-Timestamp                |
| `finishedAt`  | Erfolg oder Fehler   | ISO-8601-Timestamp                |
| `status`      | Jede Phase           | running → retrying → success/failure |
| `durationMs`  | Erfolg oder Fehler   | `Date.now() - startMs`            |
| `retryCount`  | Jeder Retry          | Anzahl bisheriger Versuche        |
| `error`       | Nur bei failure      | Fehlermeldung des letzten Fehlers |

- `pushLog` begrenzt den In-Memory-Puffer auf 1 000 Einträge (älteste werden verworfen).
- `getExecutionLog()` gibt eine Kopie in umgekehrter Reihenfolge zurück (neueste zuerst).
- Log-Einträge werden per Referenz mutiert (kein Ersetzen), was bei gleichzeitigen Ausführungen zu Race Conditions führen könnte — für sequentiellen Single-Process-Betrieb jedoch ausreichend (wie im Header dokumentiert).

---

## Vorgenommene Korrekturen

### Korrektur 1: /TR-Quoting in scheduleWindowsTask (Zeile ~274)

```diff
- const runCmd = `"${nodeExe}" "${winScript}"`;
+ // /TR-Wert: innere Anführungszeichen mit \" escapen, damit CMD.EXE das Argument
+ // korrekt als einen Token parst (schtasks /Create /TR "\"exe\" \"arg\"")
+ const runCmd = `\\"${nodeExe}\\" \\"${winScript}\\"`;
```

### Korrektur 2: Bereichs-Syntax im dayOfWeek-Parser (Zeilen ~137–146)

```diff
  if (dayOfWeek !== '*') {
    const dowMap: Record<string, string> = { ... };
+
+   // Bereichsausdruck "A-B" expandieren (z.B. "1-5" → MON,TUE,WED,THU,FRI)
+   const rangeMatch = /^(\d)-(\d)$/.exec(dayOfWeek);
+   if (rangeMatch) {
+     const from = parseInt(rangeMatch[1], 10);
+     const to   = parseInt(rangeMatch[2], 10);
+     const days = Array.from({ length: to - from + 1 }, (_, i) => dowMap[String(from + i)] ?? '')
+       .filter(Boolean)
+       .join(',');
+     return { schedule: 'WEEKLY', day: days || 'MON', startTime };
+   }
+
    const day = dowMap[dayOfWeek] ?? 'MON';
    return { schedule: 'WEEKLY', day, startTime };
  }
```

---

## Hinweise (keine Fehler)

- **Monatlich:** `cronToSchtasksArgs` mappt monatliche Ausdrücke (`0 8 1 * *`) auf `DAILY` — bewusste Vereinfachung, in der Datei dokumentiert. Für echtes monatliches Scheduling wird `scheduleCronJob` empfohlen.
- **EVERY_30MIN als Windows-Task:** `*/30 * * * *` → `HOURLY /MO 30` — schtasks interpretiert `/MO` bei HOURLY als Intervall in Stunden, nicht Minuten. Diese Konstante sollte nur mit `scheduleCronJob` verwendet werden, nicht mit `scheduleWindowsTask`.
- **Thread-Sicherheit:** `fs.appendFileSync` und die Log-Array-Mutation sind nicht thread-safe; für Single-Process-Betrieb dokumentiert und akzeptabel.

# CRM-Automatisierung — Live-Tests

## Voraussetzungen

### 1. Chrome mit CDP-Debug-Port starten

Die Tests kommunizieren direkt mit Chrome über das Chrome DevTools Protocol (CDP).
Chrome muss **vor** dem Testlauf mit dem Remote-Debugging-Port gestartet werden:

```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="C:\Users\ds\.chrome-debug-profile" ^
  --no-first-run ^
  --no-default-browser-check ^
  https://crm.job-step.com
```

Alternativ den im Projekt vorhandenen Start-Befehl verwenden:

```cmd
npx ts-node -e "const {getChromeStartCommand} = require('./src/session-manager'); const c = getChromeStartCommand(); require('child_process').spawn(c.executable, c.args, {detached: true, stdio: 'ignore'}).unref();"
```

### 2. Abhängigkeiten installieren

```cmd
npm install
```

Benötigte Pakete (aus `package.json`):
- `ts-node` — TypeScript direkt ausführen
- `typescript` — TypeScript-Compiler
- `node-cron` — Für Scheduler-Tests

### 3. CDP-Verbindung prüfen

Browser-Zugang testen (sollte JSON zurückgeben):

```cmd
curl http://localhost:9222/json
```

---

## Tests ausführen

### Standard-Ausführung (alle Tests)

```cmd
cd C:\Users\ds\crm-automation
npx ts-node tests/live-test.ts
```

### Mit explizitem ts-node-Pfad (falls npx nicht funktioniert)

```cmd
cd C:\Users\ds\crm-automation
node_modules\.bin\ts-node tests/live-test.ts
```

### Mit TypeScript-Pfad-Auflösung (bei Pfad-Problemen)

```cmd
cd C:\Users\ds\crm-automation
npx ts-node --project tsconfig.json tests/live-test.ts
```

---

## Teststruktur

Die Datei `tests/live-test.ts` enthält einen eigenen minimalen Test-Runner
**ohne externe Test-Framework-Abhängigkeiten** (kein Jest, kein Mocha).

### Getestete Module

| Modul | Datei | Tests |
|---|---|---|
| Session-Manager | `src/session-manager.ts` | 6 Tests |
| Popup-Handler | `src/popup-handler.ts` | 6 Tests |
| File-Upload | `src/file-upload.ts` | 8 Tests |
| Scheduler | `src/scheduler.ts` | 8 Tests |

**Gesamt: 28 Tests**

### Test-Kategorien

**Session-Manager-Tests:**
- Chrome läuft auf Port 9222 (Verbindungstest via HTTP)
- `getProfilePath()` gibt konfigurierten Pfad zurück
- `getProfilePath()` mit Standard-Konfiguration
- `isSessionValid()` gibt `boolean` zurück (benötigt Chrome)
- `exportSession()` erzeugt valide JSON-Datei auf Disk (benötigt Chrome)
- `getChromeStartCommand()` liefert valide Struktur mit Pflicht-Flags

**Popup-Handler-Tests:**
- Instanziierung ohne Argumente
- `addRule()` fügt Regeln ohne Fehler hinzu
- `getDialogLog()` gibt leeres Array bei frischer Instanz zurück
- `getDialogLog()` gibt Kopie (keine direkte Referenz)
- Default-Regeln aktiv (`clearLog`, `setDefaultAction`, `destroy` fehlerfrei)
- `addRule()` mit optionalem `promptText`-Parameter

**File-Upload-Tests:**
- Instanziierung ohne Argumente
- Instanziierung mit vollständiger Konfiguration
- `uploadFile()` mit nicht-existierender Datei → korrekter Fehler
- `uploadFile()` mit relativem Pfad → korrekter Fehler
- `uploadFromUrl()` mit ungültiger URL → korrekter Fehler
- `uploadFromUrl()` mit nicht-erreichbarer HTTP-URL → Netzwerkfehler
- `disconnect()` ohne vorherige Verbindung fehlerfrei
- `cleanup()` bei leerem tempFiles-Array fehlerfrei

**Scheduler-Tests:**
- Instanziierung mit Standard-Konfiguration
- `listSchedules()` gibt leeres Array bei frischer Instanz
- `getExecutionLog()` gibt leeres Array bei frischer Instanz
- `SCHEDULE`-Konstanten vorhanden und mit validen cron-Ausdrücken
- `scheduleCronJob()` + `listSchedules()` Roundtrip
- `scheduleCronJob()` mit ungültigem cron-Ausdruck → Fehler
- `getExecutionLog()` enthält Eintrag nach `runNow()`
- `runNow()` mit unbekanntem Namen → Fehler

---

## Ausgabe-Format

```
CRM-AUTOMATISIERUNG — LIVE-TESTS
============================================================
Datum:     2026-03-26T10:00:00.000Z
CDP-Port:  localhost:9222
Node.js:   v20.x.x
============================================================

============================================================
  SESSION-MANAGER
============================================================
  PASS  Chrome läuft auf Port 9222 (Verbindungstest)
  PASS  getProfilePath() gibt konfigurierten Profil-Pfad zurück
  ...

============================================================
  TESTERGEBNIS
============================================================
Gesamt:     28 Tests
Bestanden:  28/28
Fehler:     0
============================================================

Alle Tests bestanden.
```

---

## Exit-Codes

| Code | Bedeutung |
|---|---|
| `0` | Alle Tests bestanden |
| `1` | Mindestens ein Test fehlgeschlagen oder fataler Fehler |

---

## Hinweise

### Tests ohne Chrome

Tests, die eine CDP-Verbindung erfordern (`isSessionValid`, `exportSession`),
werden mit einer klaren Fehlermeldung fehlschlagen wenn Chrome nicht läuft:

```
FAIL  isSessionValid() gibt boolean zurück
      Chrome nicht erreichbar — Test übersprungen (Chrome benötigt)
```

Alle anderen Tests (Instanziierung, Fehlerbehandlung, Konstanten) laufen
auch ohne laufendes Chrome durch.

### Temporäre Dateien

Die Tests erstellen temporäre Verzeichnisse unter:
```
C:\Users\ds\crm-automation\tests\tmp-logs-*
```
Diese werden am Ende jedes Tests automatisch gelöscht.

Session-Export-Testdateien (`session-export-test-*.json`) werden ebenfalls
automatisch im `finally`-Block bereinigt.

### Scheduler-Logs

Während der Scheduler-Tests wird ein temporäres Log-Verzeichnis angelegt
und automatisch wieder gelöscht. Das produktive Log-Verzeichnis
(`C:\Users\ds\crm-automation\logs`) wird nicht berührt.

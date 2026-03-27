# CRM-Automatisierung — Produktdokumentation

## Projektübersicht

**crm-automation** ist ein autonomes Automatisierungsprojekt für die CRM-Plattform **crm.job-step.com**. Es ermöglicht unbeaufsichtigte Datenverarbeitung, Dialog-Verwaltung und Datei-Uploads direkt über Chrome DevTools Protocol (CDP) — ohne externe Automatisierungs-Frameworks wie Playwright oder Stagehand.

**Kern-Merkmale:**
- Persistente Chrome-Sitzungen mit Cookie-Management
- JavaScript-Dialog-Automation (alert, confirm, prompt)
- Zuverlässiger Datei-Upload via CDP DOM.setFileInputFiles
- Windows Task Scheduler & Cron-basierte Automation
- Retry-Mechanismen für robuste Ausführung

## Voraussetzungen

- **Node.js** v20+ (ES2020-Support erforderlich)
- **Chrome/Chromium** (mit CDP über Port 9222 erreichbar)
- **Windows 11** Build 26200+ (getestet auf Pro/Enterprise)
- **Administrator-Rechte** optional (für Windows Task Scheduler Integration)

## Schnellstart (5 Schritte)

### 1. Installation

```bash
npm install
```

Installiert alle Abhängigkeiten (node-cron, sqlite3, @anthropic-ai/sdk, etc.).

### 2. Chrome mit CDP starten

```powershell
# PowerShell Administrator
$chromeExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profileDir = "C:\Users\ds\.chrome-debug-profile"
& $chromeExe --remote-debugging-port=9222 --user-data-dir="$profileDir"
```

Chrome startet im Debug-Modus auf Port 9222 mit persistentem Profil.

### 3. SessionManager initialisieren

```typescript
import { createSessionManager } from './src/session-manager';

const session = await createSessionManager({
  profilePath: 'C:\\Users\\ds\\.chrome-debug-profile',
  targetUrl: 'https://crm.job-step.com',
});

const isValid = await session.isSessionValid();
console.log('Session gültig?', isValid);
```

### 4. PopupHandler registrieren

```typescript
import { PopupHandler } from './src/popup-handler';

const popupHandler = new PopupHandler();
popupHandler.init(cdpSession); // Wo cdpSession von sessionManager kommt

// Dialoge werden automatisch bearbeitet
```

### 5. Datei-Upload ausführen

```typescript
import { createFileUploadManager } from './src/file-upload';

const uploader = createFileUploadManager();
const success = await uploader.uploadFile(
  'C:\\Temp\\dokument.pdf',
  'input[type="file"]'
);
console.log('Upload erfolgreich?', success);
```

---

## Modulübersicht

### **session-manager.ts**
Verwaltet die persistente Chrome-Sitzung über CDP WebSocket. Stellt Cookie-Export/-Import, Session-Validierung (via DOM + Cookie-Prüfung) und automatischen Re-Login bereit. Der SessionManager hält eine minimale RFC-6455-WebSocket-Implementierung, um externe Abhängigkeiten zu vermeiden.

**Verwendungsbeispiel:**
```typescript
const mgr = new SessionManager({ cdpPort: 9222 });
await mgr.init();
await mgr.exportSession('./session.json');
await mgr.isSessionValid();
```

### **popup-handler.ts**
Automatisiert JavaScript-Dialoge (alert, confirm, prompt) und HTML-`<dialog>`-Elemente mit konfigurierbaren Regex-Regeln. Dialoge werden geloggt und können maschinell beantwortet werden (z.B. "Speichern" akzeptieren, "Löschen" ablehnen).

**Verwendungsbeispiel:**
```typescript
const handler = new PopupHandler();
handler.init(cdpSession);
handler.addRule(/löschen/i, 'dismiss'); // Lösch-Dialoge ablehnen
handler.addRule(/speichern/i, 'accept');
const closed = await handler.closeHtmlDialogs('accept');
```

### **file-upload.ts**
Lädt lokale und Remote-Dateien in File-Input-Elemente via CDP `DOM.setFileInputFiles`. Unterstützt Windows-Pfade (Backslash-Normalisierung), versteckte Inputs (temporär sichtbar machen) und Multi-Datei-Uploads mit Verifikation. Retry-Logik mit konfigurierbarem Timeout und Wartezeit.

**Verwendungsbeispiel:**
```typescript
const uploader = new FileUploadManager();
await uploader.uploadFile('C:\\files\\report.pdf', 'input.document');
await uploader.uploadFromUrl('https://example.com/file.pdf', 'input.doc');
const verified = await uploader.verifyUpload('input.document');
```

### **scheduler.ts**
Scheduling-Modul für autonome CRM-Jobs. Unterstützt zwei Strategien: Windows Task Scheduler (systemweit, persistierbar) und node-cron (In-Process). Retry-Logik, Ausführungsprotokoll und Windows-Ereignislog-Integration für Fehlerbenachrichtigungen.

**Verwendungsbeispiel:**
```typescript
import { scheduler, SCHEDULE } from './src/scheduler';

scheduler.scheduleCronJob(
  'daily-sync',
  async () => { /* CRM-Sync-Code */ },
  SCHEDULE.DAILY_8AM
);
```

---

## Architektur (Überblick)

```
┌─────────────────────────────────────────────────┐
│     Chrome Browser (Port 9222 / CDP)           │
│  ┌──────────────────────────────────────────┐  │
│  │  https://crm.job-step.com               │  │
│  │  DOM, Cookies, Dialoge, File-Inputs     │  │
│  └──────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────────┘
               │ WebSocket (CDP)
               ▼
┌─────────────────────────────────────────────────┐
│    SessionManager                              │
│  • Cookie-Management                           │
│  • Session-Validierung                         │
│  • WebSocket-Infrastruktur (RFC-6455)         │
└──────────────┬──────────────────────────────────┘
               │
        ┌──────┴──────┬──────────┬────────────┐
        ▼             ▼          ▼            ▼
    PopupHandler FileUploadMgr Scheduler  Custom Logic
    (Dialoge)    (File I/O)   (Tasks)      (Business)
```

---

## Fehlerbehandlung & Logging

### SessionManager
- **Fehler:** CDP-Befehle mit Timeout (15s Standard), Verbindungsabbruch, Session-Verlust
- **Logging:** Konsole + Kontext-Tags `[SessionManager]`
- **Recovery:** Automatisches Reconnect (bis 3 Versuche) bei Versuch 1

### FileUploadManager
- **Fehler:** Datei nicht gefunden, Node-ID-Lookup, CDP-Timeout, Verifikation fehlgeschlagen
- **Logging:** Optional verbos (`verbose: true`), Fehler auf stderr
- **Recovery:** Retry-Schleife (3× Standard) mit 1,5s Wartezeit, temporäre Dateien werden auch bei Fehler bereinigt

### PopupHandler
- **Fehler:** CDP-Verbindung verloren, ungültige Regex-Regel
- **Logging:** Log-Array mit Timestamp, Dialog-Typ, Aktion und gematchte Regel
- **Recovery:** Listener kann detached/re-attached werden ohne State-Verlust

### CrmScheduler
- **Fehler:** schtasks-Fehler (Windows-Task), Timeout bei Funktions-Ausführung
- **Logging:** Datei (`scheduler.log`) + Konsole + Windows-Ereignislog (Admin-abhängig)
- **Recovery:** Retry-Schleife (3× Standard) mit 30s Wartezeit, alte Log-Einträge (>1000) werden verworfen

---

## Windows 11 spezifische Hinweise

### Chrome-Profil-Pfad
Wird unter Windows mit Backslashes angegeben:
```typescript
profilePath: 'C:\\Users\\ds\\.chrome-debug-profile'
```
Intern wird der Pfad normalisiert (Backslash → Forward-Slash) für CDP.

### Task Scheduler Integration
schtasks-Befehle benötigen Administrator-Rechte für permanente Task-Registrierung:
```powershell
# Administrator starten dann:
npm run start
```

Fehlgeschlagene Tasks loggen optional ins Windows-Ereignisprotokoll (erfordert Admin).

### Port 9222 (Firewall)
Port 9222 ist der CDP-Standard und lauscht **nur auf localhost**. Externe Verbindungen sind nicht möglich (Sicherheit). Falls Firewall blockiert, kann in Entwicklung eine Ausnahme erstellt werden:
```powershell
netsh advfirewall firewall add rule name="Chrome CDP" dir=in action=allow protocol=tcp localport=9222
```

### Path-Umgebung
Stelle sicher, dass `node.exe` und `ts-node` im `%PATH%` sind:
```powershell
$env:PATH += ";C:\Users\ds\AppData\Roaming\npm"
```

---

## Abhängigkeiten & Licenses

| Paket | Version | Zweck |
|-------|---------|-------|
| node-cron | ^3.0.3 | Cron-Expression-Parsing & Job-Scheduling |
| sqlite3 | ^5.1.7 | Persistente Daten (optional) |
| @anthropic-ai/sdk | ^0.36.3 | Anthropic API Integration |
| 2captcha-ts | ^2.0.0 | CAPTCHA-Lösung (optional) |
| node-fetch | ^3.3.2 | HTTP-Requests (z.B. für Downloads) |

**Dev-Dependencies:** typescript, ts-node, ts-node-dev, @types/*

---

## Sicherheits-Hinweise

1. **Chrome-Profil:** Wird mit persistenter Session-Speicherung erstellt. Credentials bleiben lokal.
2. **Port 9222:** Nur localhost zugänglich — nicht ins Internet exponieren.
3. **Cookies & Session-Export:** `session.json` enthält Auth-Cookies. Mit admin-only Berechtigungen speichern.
4. **Fehlerprotokollierung:** `scheduler.log` enthält potentiell sensible Task-Namen/Meldungen.

---

## Troubleshooting

### Chrome verbindet nicht (CDP Timeout)

```bash
# 1. Chrome ist noch nicht mit --remote-debugging-port=9222 gestartet
# 2. Port 9222 ist belegt (netstat -ano | findstr :9222)
# 3. Firewall blockiert localhost:9222
```

**Lösung:**
```powershell
# Chrome beenden, Port freigeben
taskkill /IM chrome.exe /F
# Chrome mit korrekten Flags starten
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

### "Selektor nicht gefunden" bei File-Upload

```typescript
// Debug: JavaScript im CDP ausführen um Element zu prüfen
const result = await client.send('Runtime.evaluate', {
  expression: `document.querySelectorAll('input[type="file"]').length`,
  returnByValue: true,
});
```

### Windows-Task wird nicht ausgeführt

```powershell
# Task-Fehlerlog anschauen
schtasks /query /TN "CRM\*" /v /fo list

# Task manuell ausführen
schtasks /Run /TN "CRM\task-name"
```

---

## Lizenz & Kontakt

Siehe `LICENSE` oder Projektowner für weitere Informationen.

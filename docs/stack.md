# Technologie-Stack & Architektur

## Stack-Tabelle

| Bereich | Komponente | Version | Zweck |
|---------|-----------|---------|-------|
| **Sprache** | TypeScript | 5.4.5 | Typsicherheit, strict mode |
| **Runtime** | Node.js | 20+ (LTS) | Ausführungs-Engine |
| **Target** | ES2020 | — | Modernes JavaScript (Promise, async/await) |
| **Build** | tsc | 5.4.5 | TypeScript → JavaScript Compilation |
| **Dev** | ts-node | 10.9.2 | DirectTypescript-Ausführung ohne Build-Schritt |
| **Debugging** | Chrome CDP | — | Chrome DevTools Protocol über WebSocket |
| **CDP-Host** | localhost | Port 9222 | Lokal gebundener Debug-Port (nicht netzweit!) |

## Abhängigkeiten (package.json)

### Production-Dependencies

```json
{
  "node-cron": "^3.0.3"
}
```
**node-cron** — Cron-Expression-Parser und Job-Scheduler für In-Process-Automation. Standard-Syntax wie `"0 8 * * *"` (täglich 8 Uhr). Wird kombiniert mit Windows Task Scheduler für Persistenz.

```json
{
  "sqlite3": "^5.1.7"
}
```
**sqlite3** — Optionale lokale Datenbank für Persistierung von Session-Logs, Task-Protokollen oder Job-Metadaten. Wird nicht direkt durch die Core-Module verwendet, sondern steht für Erweiterungen zur Verfügung.

```json
{
  "@anthropic-ai/sdk": "^0.36.3"
}
```
**@anthropic-ai/sdk** — Anthropic API SDK für mögliche AI-Integration (z.B. intelligente Dialog-Klassifikation, OCR auf Screenshots). Wird aktuell optional genutzt.

```json
{
  "2captcha-ts": "^2.0.0"
}
```
**2captcha-ts** — CAPTCHA-Solving Service Wrapper. Falls crm.job-step.com CAPTCHAs nutzt, kann dieses Modul deren Lösung automatisieren.

```json
{
  "node-fetch": "^3.3.2"
}
```
**node-fetch** — HTTP-Client für Datei-Downloads (`uploadFromUrl` in file-upload.ts). Wird auch für CDP HTTP-Abfragen zur Target-Discovery genutzt.

### Dev-Dependencies

```json
{
  "typescript": "^5.4.5",
  "ts-node": "^10.9.2",
  "ts-node-dev": "^2.0.0",
  "@types/node": "^20.14.0",
  "@types/node-cron": "^3.0.11",
  "@types/sqlite3": "^3.1.11"
}
```
- **typescript** — Compiler
- **ts-node** — REPL & Script-Runner
- **ts-node-dev** — Watch-Mode für Entwicklung (`npm run dev`)
- **@types/\*** — TypeScript Typ-Definitionen für native Node.js APIs und externe Pakete

---

## Architektur-Diagramm (ASCII)

```
┌────────────────────────────────────────────────────────────────┐
│                    Chrome Browser Instance                     │
│                 (--remote-debugging-port=9222)                 │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              https://crm.job-step.com                   │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │ DOM Elements (Input, Dialog, Button, etc.)       │  │ │
│  │  │ Cookies, LocalStorage, Session                  │  │ │
│  │  │ JavaScript Runtime                              │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  [Port 9222]   Chrome DevTools Protocol (CDP)                │
│  ├─ Page Domain (Navigation, Events)                         │
│  ├─ DOM Domain (querySelector, describeNode)                 │
│  ├─ Runtime Domain (evaluate JavaScript)                     │
│  ├─ Network Domain (Cookies, getAllCookies)                 │
│  └─ Input Domain (Type, Click)                              │
└─────────────────┬──────────────────────────────────────────────┘
                  │
                  │ WebSocket (RFC-6455)
                  │ JSON RPC 2.0 Messages
                  ▼
┌────────────────────────────────────────────────────────────────┐
│           Node.js Application (TypeScript)                     │
│                                                                │
│  ┌─ SessionManager ────────────────────────────────────────┐ │
│  │ • WebSocket-Client (custom RFC-6455 impl.)            │ │
│  │ • CDP Message-Routing & Timeout-Management            │ │
│  │ • Cookie-Persistence (export/import .json)            │ │
│  │ • Session-Validation (DOM + Cookie-Check)             │ │
│  │ • Re-Login-Trigger                                    │ │
│  └───────────────┬────────────────────────────────────────┘ │
│                  │ Provides: CDP Session Handle
│                  │
│  ┌──────────────┴──────────────┬──────────────┬────────────┐ │
│  ▼                             ▼              ▼            ▼ │
│ PopupHandler              FileUploadMgr  Scheduler      Custom |
│ • Dialog Listener         • Path Normaliz. Cron Jobs     Logic │
│ • Pattern Matching        • Hidden Input  Windows Task        │
│ • Auto-Response           • Multi-File    Task Logger     (Biz) │
│ • HTML Dialog Close       • Download      Retry Logic         │
│ • Event Log              • Verify Upload  Notifications       │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              Persistent Storage (Optional)               │ │
│  │  ├─ Session Data (.json)                               │ │
│  │  ├─ Scheduler Logs (scheduler.log)                     │ │
│  │  ├─ Execution Protocol (In-Memory + File)              │ │
│  │  └─ SQLite3 (crm-automation.db, optional)              │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │           External Integrations (Optional)                │ │
│  │  ├─ Anthropic API (@anthropic-ai/sdk)                 │ │
│  │  ├─ 2Captcha API (2captcha-ts)                         │ │
│  │  └─ HTTP Downloads (node-fetch)                        │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

---

## Datenfluss: Datei-Upload Beispiel

```
User Code:
  uploadFile('C:\\file.pdf', 'input[type="file"]')
           │
           ▼
FileUploadManager:
  1. Validiere lokalen Pfad (exists, isFile, readable)
  2. Stelle CDP-Verbindung her (falls nicht aktiv)
     └─ HTTP GET http://localhost:9222/json
     └─ Parse WebSocket URL des ersten Page-Targets
     └─ WebSocket Connect + DOM.enable
  3. Resolve DOM-Node für Selektor
     └─ CDP: DOM.getDocument → Root-NodeId
     └─ CDP: DOM.querySelector → Target-NodeId
  4. Falls versteckt: Sichtbar machen via Runtime.evaluate
  5. Normalisiere Windows-Pfad (C:\file.pdf → C:/file.pdf)
  6. CDP: DOM.setFileInputFiles { nodeId, files: ["C:/file.pdf"] }
  7. Warte 300ms (Browser verarbeitet Change-Event)
  8. Verifikation: Runtime.evaluate input.files.length > 0
  9. Bei Fehler: Retry (3× mit 1,5s Delay)
  10. Return true/false
```

---

## WebSocket-Kommunikation (CDP)

### Handshake (RFC-6455)

```
Client → Server:
GET /devtools/page/... HTTP/1.1
Host: localhost:9222
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: <base64-random-key>
Sec-WebSocket-Version: 13

Server → Client:
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: <derived-key-hash>
```

### Message-Format (JSON-RPC 2.0)

```
Client → Server:
{
  "id": 1,
  "method": "Network.getAllCookies",
  "params": {}
}

Server → Client:
{
  "id": 1,
  "result": {
    "cookies": [
      { "name": "JSESSIONID", "value": "...", "domain": "crm.job-step.com", ... }
    ]
  }
}

// Event (kein id):
{
  "method": "Page.javascriptDialogOpening",
  "params": { "type": "alert", "message": "Speichern erfolgreich" }
}
```

### Frame-Format (Binary, RFC-6455 §5)

```
Byte Layout (Client-zu-Server muss maskiert sein):

FIN (1 bit) | RSV (3) | Opcode (4)  →  1 Byte
Mask (1 bit) | Payload Len (7)       →  1 Byte
[Extended Payload Length (2 oder 8 Byte)]
[Masking Key (4 Byte)]
[Masked Payload Data]

Opcode:
  1 = Text Frame
  8 = Connection Close
  9 = Ping (auto-responded mit Pong)
```

---

## Session-Persistence (Cookie-Handling)

### Export-Ablauf

```typescript
const result = await sendCommand('Network.getAllCookies', {});
// result.cookies[] aus crm.job-step.com Domain-Filter
const session: SessionFile = {
  exportedAt: "2024-03-27T...",
  profilePath: "C:\\Users\\ds\\.chrome-debug-profile",
  targetUrl: "https://crm.job-step.com",
  cookies: [...filtered]
};
fs.writeFileSync('session.json', JSON.stringify(session, null, 2));
```

### Import-Ablauf

```typescript
// 1. Alte Cookies räumen: Network.clearBrowserCookies
// 2. Für jeden Cookie:
const result = await sendCommand('Network.setCookie', {
  name, value, domain, path, expires, httpOnly, secure, sameSite
});
// 3. Seite neu laden: Page.reload
```

**Wichtig:** Nur Cookies der Domain `crm.job-step.com` werden exportiert (kein Datenmüll). Session-Cookies (expires = -1) werden mitexportiert, sind aber nach Browser-Neustart ungültig.

---

## Sicherheit: Port 9222

### Lokale Bindung

```bash
# Chrome lauscht AUSSCHLIESSLICH auf localhost:9222
netstat -ano | findstr :9222
# Zeigt: LOCAL 127.0.0.1:9222  LISTENING
```

### Keine Netzwerk-Exponierung

- CDP-Port ist nicht via `--remote-debugging-port=0.0.0.0:9222` exponierbar (bei Bedarf Feature-Request)
- Falls dennoch Remote-Access nötig: SSH-Port-Forward oder separaten Chrome-Proxy verwenden
- **Niemals** Port 9222 ins Internet Router-konfigurieren

### Sitzungs-Sicherheit

```typescript
// session.json enthält Auth-Cookies → mit Admin-only Berechtigungen speichern
fs.chmodSync('session.json', 0o600); // Unix; Windows: NTFS ACL anpassen
```

---

## Windows 11 spezifische Details

### Prozess & Handles

```powershell
# Chrome mit CDP starten
$chromeExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profileDir = "C:\Users\ds\.chrome-debug-profile"
$chromeProc = Start-Process -FilePath $chromeExe -ArgumentList @(
  "--remote-debugging-port=9222",
  "--user-data-dir=$profileDir",
  "--no-first-run",
  "--disable-sync"
) -PassThru

# Port 9222 wird sofort nach Chrome-Start bereit
Start-Sleep -Seconds 2
$connection = [System.Net.Sockets.TcpClient]::new()
$connection.Connect("127.0.0.1", 9222) # Sollte sofort funktionieren
```

### Task Scheduler Integration (schtasks.exe)

```powershell
# Task registrieren (Admin-Rechte erforderlich)
schtasks /Create /F /TN "CRM\daily-sync" `
  /TR "\"C:\Program Files\nodejs\node.exe\" \"C:\crm-automation\sync.js\"" `
  /SC DAILY /ST 08:00 /RU ""

# Task in Logs eintragen (mit Admin)
schtasks /Run /TN "CRM\daily-sync"
Get-EventLog -LogName Application | Where-Object {$_.Source -eq "CrmAutomation"}
```

### Pfad-Behandlung

```typescript
// Windows-Pfade intern mit Backslash
const winPath = 'C:\\Users\\ds\\.chrome-debug-profile';

// Für CDP MUSS Forward-Slash sein
const cdpPath = winPath.replace(/\\/g, '/'); // C:/Users/ds/.chrome-debug-profile

// Path-Module normalisiert zu Backslash
const resolved = path.resolve(winPath); // C:\Users\ds\.chrome-debug-profile
```

### Umgebungsvariablen

```powershell
# Überprüfe ob node/npm im PATH sind
$env:PATH -split ";" | Select-String "nodejs|npm"

# Setze falls nötig
$env:PATH += ";C:\Program Files\nodejs"
[Environment]::SetEnvironmentVariable("PATH", $env:PATH, "User")
```

---

## Performance & Limits

| Bereich | Limit | Begründung |
|---------|-------|------------|
| **Cookie-Anzahl** | ≤180 pro Domain | Browser-Standard, CDP respektiert das |
| **Payload-Größe** | ≤10MB pro setFileInputFiles | CDP-interne Grenze |
| **WebSocket-Nachricht** | ≤64MB | Node.js Buffer-Limit |
| **Execution-Log** | 1000 Einträge (In-Memory) | Speicher-Management |
| **Command-Timeout** | 15.000ms (SessionManager) | Standardwert, konfigurierbar |
| **Retry-Versuche** | 3 (Standard) | Balancing zwischen Robustheit und Zeit |

---

## Fehler-Codes & Behebung

### CDP-Fehler

| Code | Bedeutung | Behebung |
|------|-----------|----------|
| -32600 | Invalid Request | Malformed JSON-RPC Message |
| -32601 | Method Not Found | CDP-Methode nicht unterstützt (z.B. alte Chrome) |
| -32603 | Internal Error | Chrome-interne Exception |
| -32700 | Parse Error | WebSocket-Datenfehler (Beschädigung) |

### Session-Fehler

```
[SessionManager] Session ungültig: keine gültigen Cookies gefunden.
→ Cookies abgelaufen oder manuel gelöscht
→ Lösung: triggerRelogin() oder neue Sitzung

[SessionManager] WebSocket-Verbindung unerwartet geschlossen.
→ Chrome abstürzt oder wird geschlossen
→ Lösung: Chrome neu starten mit CDP-Flags
```

### File-Upload-Fehler

```
Element nicht gefunden für Selektor: "input[type='file']"
→ Selektor falsch oder Element dynamisch geladen
→ Lösung: Selektor debuggen mit Runtime.evaluate

Upload-Verifikation fehlgeschlagen: files.length === 0
→ CDP-Befehl lief durch, aber Browser verarbeitet nicht
→ Lösung: Warte-Zeit (sleep 300ms) erhöhen oder Netzwerk prüfen
```

---

## Licensing & Abhängigkeits-Kompatibilität

- **node-cron:** MIT
- **sqlite3:** BSD 3-Clause
- **@anthropic-ai/sdk:** MIT
- **node-fetch:** MIT
- **2captcha-ts:** MIT
- **TypeScript/ts-node:** Apache-2.0

Alle Abhängigkeiten sind OSS und produktiv einsatzbar.

---

## Build & Deployment

### Build aus TypeScript

```bash
npm run build
# Erzeugt ./dist/ mit kompilierten .js-Dateien
```

### Direktausführung (ts-node, ohne Build)

```bash
npm start              # Standard-Entry: src/index.ts
npm run dev           # Watch-Mode für Entwicklung
npm test              # Test-Suite aus tests/live-test.ts
```

### Windows Batch-Starter (optional)

```batch
@echo off
REM start-crm.bat — Startet Chrome mit CDP + Node-App
set CHROME_PROFILE=%USERPROFILE%\.chrome-debug-profile
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%CHROME_PROFILE%"
timeout /t 2
cd /d C:\crm-automation
npm start
pause
```

---

**Letzte Aktualisierung:** 2026-03-26
**Target-Umgebung:** Windows 11 Build 26200, Node.js 20 LTS, Chrome 90+

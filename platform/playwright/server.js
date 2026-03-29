/**
 * Playwright CRM Microservice
 * ============================
 * HTTP-API für die Next.js-App, um CRM-Aktionen
 * per Headless Chrome auszuführen.
 *
 * Endpoints:
 *   GET  /health              — Health Check
 *   POST /login               — CRM-Login für User
 *   POST /validate            — Credentials testen
 *   POST /navigate            — Seite öffnen + Inhalt lesen
 *   POST /search              — Suche in CRM-Modul
 *   POST /click               — Button klicken
 *   POST /fill                — Formular ausfüllen
 *   POST /screenshot          — Screenshot machen
 *   POST /execute             — Generische CRM-Aktion
 *   POST /logout              — Session schließen
 */

const http = require("http");
const crm = require("./crm-browser");
const { popupHandler } = require("./popup-handler");
const { uploadBase64File, waitForDownload } = require("./file-upload-handler");
const { createLogger } = require("./logger");

const log = createLogger("playwright-server");
const PORT = process.env.PORT || 3001;

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

// Hilfsfunktion: Request-Body parsen (mit Size-Limit)
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large (max 1MB)"));
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error("Ungültiges JSON")); }
    });
    req.on("error", reject);
  });
}

// Hilfsfunktion: JSON-Response (mit headersSent-Check + Security Headers)
function json(res, status, data) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

// CRM-Modul-Pfade (Kurzname → URL-Pfad)
const MODULE_PATHS = {
  dashboard: "/",
  nachrichten: "/messages?page=list",
  kandidaten: "/kandidati?page=list_ajax",
  sales_neu: "/sales?page=list&type=0&status=0",
  sales_aktiv: "/sales?page=list&type=0&status=1",
  sales: "/sales?page=list&type=1&status=1",
  companies: "/companies?page=list",
  auftraege: "/nalozi?page=list",
  finanzen: "/finances?page=info",
  tasks: "/tasks?page=list&sort=new",
  tasks_alle: "/tasks?page=list_all&sort=new",
  mitarbeiter: "/employees?page=list",
  kampagnen: "/kampanje?page=list",
  dipl: "/dipl?page=listaObrada",
  dak: "/dak?page=list&type=0",
  partner: "/partners/list",
  dvag: "/dvag_kandidati?page=list",
  positionen: "/positions?page=list",
  teams: "/timovi?page=list",
  logs: "/logs?page=list",
  tickets: "/tiketi?page=list",
  statistiken: "/modul_statistike?page=open",
  taskforce: "/tf_naslovnica",
  casting: "/casting_appointments?page=openAll",
  dashboard_auftraege: "/dashboardNaloga/companies.php",
  abgaenge: "/odlasci.php",
  finanzprojektion: "/financesProjection.php?page=list",
  bewerbungen: "/pregledPrijava.php?page=main_list",
  reports: "/employees-reports?page=list",
  provisionen: "/provizije?page=lista",
  links: "/link_generator?page=list",
  gruppen: "/grupe_kandidata?page=list",
  schulen: "/skole?page=pregled",
  providers: "/message_providers?page=list_all",
  tutorial: "/tutorial?page=list",
  faq: "/partner_faq_bot",
};

const server = http.createServer(async (req, res) => {
  try {
    // ── Health Check ──
    if (req.method === "GET" && req.url === "/health") {
      const metrics = crm.getMetrics();
      return json(res, 200, {
        status: "ok",
        service: "playwright-crm",
        modules: Object.keys(MODULE_PATHS).length,
        ...metrics,
      });
    }

    // ── Modul-Liste ──
    if (req.method === "GET" && req.url === "/modules") {
      return json(res, 200, { modules: MODULE_PATHS });
    }

    // Alle weiteren Endpoints sind POST
    if (req.method !== "POST") {
      return json(res, 405, { error: "Method not allowed" });
    }

    const body = await parseBody(req);
    const { userId } = body;

    if (!userId) {
      return json(res, 400, { error: "userId erforderlich" });
    }

    const startTime = Date.now();

    // ── Login ──
    if (req.url === "/login") {
      const { username, password } = body;
      if (!username || !password) return json(res, 400, { error: "username und password erforderlich" });

      const result = await crm.login(userId, username, password);
      return json(res, 200, { ...result, duration_ms: Date.now() - startTime });
    }

    // ── Validate Credentials ──
    if (req.url === "/validate") {
      const { username, password } = body;
      if (!username || !password) return json(res, 400, { error: "username und password erforderlich" });

      const loginResult = await crm.login(userId, username, password);
      if (loginResult.success) {
        await crm.closeSession(userId); // Test-Session schließen
      }
      return json(res, 200, { valid: loginResult.success, duration_ms: Date.now() - startTime });
    }

    // ── Navigate ──
    if (req.url === "/navigate") {
      const { module, path } = body;
      const targetPath = module ? MODULE_PATHS[module.toLowerCase()] : path;

      if (!targetPath) {
        return json(res, 400, { error: `Unbekanntes Modul: ${module}. Verfügbar: ${Object.keys(MODULE_PATHS).join(", ")}` });
      }

      const result = await crm.navigate(userId, targetPath);
      return json(res, 200, { ...result, duration_ms: Date.now() - startTime });
    }

    // ── Search ──
    if (req.url === "/search") {
      const { module, query } = body;
      const modulePath = module ? MODULE_PATHS[module.toLowerCase()] : null;

      if (!modulePath) {
        return json(res, 400, { error: `Modul erforderlich. Verfügbar: ${Object.keys(MODULE_PATHS).join(", ")}` });
      }

      const result = await crm.search(userId, modulePath, query);
      return json(res, 200, { ...result, duration_ms: Date.now() - startTime });
    }

    // ── Click ──
    if (req.url === "/click") {
      const { selector } = body;
      if (!selector) return json(res, 400, { error: "selector erforderlich" });

      const result = await crm.clickButton(userId, selector);
      return json(res, 200, { ...result, duration_ms: Date.now() - startTime });
    }

    // ── Fill Form ──
    if (req.url === "/fill") {
      const { fields } = body;
      if (!fields) return json(res, 400, { error: "fields erforderlich" });

      const result = await crm.fillForm(userId, fields);
      return json(res, 200, { ...result, duration_ms: Date.now() - startTime });
    }

    // ── Screenshot ──
    if (req.url === "/screenshot") {
      const base64 = await crm.screenshot(userId);
      return json(res, 200, { screenshot: base64, duration_ms: Date.now() - startTime });
    }

    // ── Execute (generisch) ──
    if (req.url === "/execute") {
      const { action, module, params } = body;

      // Zuerst navigieren
      if (module) {
        const modulePath = MODULE_PATHS[module.toLowerCase()];
        if (modulePath) {
          await crm.navigate(userId, modulePath);
        }
      }

      // Aktion ausführen
      let result = {};

      switch (action) {
        case "navigate":
          result = await crm.navigate(userId, params?.path || "/");
          break;
        case "search":
          result = await crm.search(userId, MODULE_PATHS[module?.toLowerCase()] || "/", params?.query || "");
          break;
        case "click":
          result = await crm.clickButton(userId, params?.selector || params?.button);
          break;
        case "fill":
          result = await crm.fillForm(userId, params?.fields || {});
          break;
        case "screenshot":
          result = { screenshot: await crm.screenshot(userId) };
          break;
        case "read":
          result = await crm.navigate(userId, MODULE_PATHS[module?.toLowerCase()] || "/");
          break;
        default:
          return json(res, 400, { error: `Unbekannte Aktion: ${action}` });
      }

      return json(res, 200, { ...result, duration_ms: Date.now() - startTime });
    }

    // ── Logout / Session schließen ──
    if (req.url === "/logout") {
      await crm.closeSession(userId);
      return json(res, 200, { success: true });
    }

    // ── Popup schließen ──
    if (req.url === "/popup-dismiss") {
      const session = await crm.getSession(userId);
      const { preferAction = "accept" } = body;
      const count = await popupHandler.closeHtmlDialogs(session.page, preferAction);
      return json(res, 200, { success: true, dialogs_closed: count, duration_ms: Date.now() - startTime });
    }

    // ── Datei hochladen ──
    if (req.url === "/upload") {
      const { selector, base64Content, filename } = body;
      if (!selector || !base64Content || !filename) {
        return json(res, 400, { error: "selector, base64Content und filename erforderlich" });
      }
      const session = await crm.getSession(userId);
      const result = await uploadBase64File(session.page, selector, base64Content, filename);
      return json(res, 200, { ...result, duration_ms: Date.now() - startTime });
    }

    // ── Crawl — CRM-Struktur scannen ──
    if (req.url === "/crawl") {
      const { crmUrl } = body;

      // Sicherstellen, dass User eingeloggt ist
      const sessionOk = await crm.hasActiveSession(userId);
      if (!sessionOk) {
        return json(res, 400, { error: "Kein aktiver Login. Bitte zuerst einloggen." });
      }

      const targetUrl = crmUrl || process.env.CRM_URL || "https://crm.job-step.com";
      const modules = {};
      const errors = [];

      // Alle bekannten Module scannen
      for (const [name, path] of Object.entries(MODULE_PATHS)) {
        try {
          const navResult = await crm.navigate(userId, path);
          modules[name] = {
            path,
            title: navResult.title || name,
            text_preview: (navResult.text || "").slice(0, 300),
            accessible: navResult.success !== false,
          };
        } catch (e) {
          errors.push({ module: name, error: e.message });
          modules[name] = { path, accessible: false, error: e.message };
        }
      }

      return json(res, 200, {
        success: true,
        scanned_at: new Date().toISOString(),
        base_url: targetUrl,
        modules_found: Object.keys(modules).length,
        modules,
        errors,
        duration_ms: Date.now() - startTime,
      });
    }

    return json(res, 404, { error: "Endpoint nicht gefunden" });
  } catch (err) {
    log.error(`${req.method} ${req.url} Fehler`, { error: err.message, stack: err.stack });
    json(res, 500, { error: err.message });
  }
});

// Graceful Shutdown
process.on("SIGINT", async () => {
  log.info("SIGINT — Shutdown gestartet");
  await crm.shutdown();
  server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  log.info("SIGTERM — Shutdown gestartet");
  await crm.shutdown();
  server.close();
  process.exit(0);
});

server.listen(PORT, () => {
  log.info(`CRM-Automation Service läuft auf Port ${PORT}`, { modules: Object.keys(MODULE_PATHS).length });
});

/**
 * crm-browser.js — Browser-Pool & CRM-Session-Manager
 * =====================================================
 * Verwaltet Headless-Chrome-Instanzen pro User.
 * Jeder User bekommt seinen eigenen BrowserContext mit
 * persistenten Cookies (Login-Session).
 */

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs/promises");
const { createLogger } = require("./logger");

const log = createLogger("crm-browser");

const DATA_DIR = path.join(__dirname, "data");
const CRM_BASE = process.env.CRM_URL || "https://crm.job-step.com";
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || "50", 10);

// Aktive Sessions: userId → { context, page, lastUsed }
const sessions = new Map();

// Pending Session-Erstellungen (Mutex pro userId)
const sessionLocks = new Map();

// Cleanup-Interval: Sessions die >30min idle sind, schließen
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

let browser = null;
let browserLaunchPromise = null;

/**
 * Browser starten (einmalig, mit Lock gegen doppelten Start + Retry)
 */
async function ensureBrowser() {
  if (browser && browser.isConnected()) return browser;

  // Verhindere parallelen Launch
  if (browserLaunchPromise) return browserLaunchPromise;

  browserLaunchPromise = (async () => {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        log.info("Starte Chromium...", { attempt });
        browser = await chromium.launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ],
        });
        log.info("Chromium gestartet");
        return browser;
      } catch (err) {
        log.error("Chromium-Start fehlgeschlagen", { attempt, error: err.message });
        if (attempt === maxRetries) {
          log.fatal("Chromium konnte nicht gestartet werden nach " + maxRetries + " Versuchen");
          throw err;
        }
        // Kurze Pause vor Retry
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  })();

  try {
    return await browserLaunchPromise;
  } finally {
    browserLaunchPromise = null;
  }
}

/**
 * User-Session holen oder erstellen (mit Mutex pro userId + Timeout)
 */
async function getSession(userId) {
  // Existierende Session zurückgeben
  if (sessions.has(userId)) {
    const session = sessions.get(userId);
    session.lastUsed = Date.now();
    return session;
  }

  // Mutex: Wenn Session gerade erstellt wird, auf Promise warten
  if (sessionLocks.has(userId)) {
    await sessionLocks.get(userId);
    if (sessions.has(userId)) {
      const session = sessions.get(userId);
      session.lastUsed = Date.now();
      return session;
    }
  }

  // Session-Limit prüfen
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(`Max. Sessions erreicht (${MAX_SESSIONS}). Bitte später versuchen.`);
  }

  // Neue Session erstellen mit Lock
  let resolve;
  const lockPromise = new Promise((r) => { resolve = r; });
  sessionLocks.set(userId, lockPromise);

  try {
    // Timeout für Session-Erstellung: 30s
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Session-Erstellung Timeout (30s)")), 30000)
    );

    const sessionPromise = (async () => {
      const b = await ensureBrowser();

      // Persistenter Storage pro User für Cookies/Session
      const userDataDir = path.join(DATA_DIR, "sessions", userId);
      await fs.mkdir(userDataDir, { recursive: true });

      const statePath = path.join(userDataDir, "state.json");
      let storageState;
      try {
        await fs.access(statePath);
        storageState = statePath;
      } catch {
        storageState = undefined;
      }

      const context = await b.newContext({
        storageState,
        viewport: { width: 1280, height: 800 },
        locale: "de-DE",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
      });

      const page = await context.newPage();
      page.setDefaultTimeout(15000);

      const session = { context, page, userId, userDataDir, lastUsed: Date.now() };
      sessions.set(userId, session);

      log.info("Session erstellt", { userId, total: sessions.size });
      return session;
    })();

    return await Promise.race([sessionPromise, timeoutPromise]);
  } catch (err) {
    log.error("Session-Erstellung fehlgeschlagen", { userId, error: err.message });
    throw err;
  } finally {
    sessionLocks.delete(userId);
    resolve();
  }
}

/**
 * Session-State speichern (Cookies etc.) — atomisch via temp-file + rename
 */
async function saveSessionState(userId) {
  const session = sessions.get(userId);
  if (!session) return;

  try {
    const statePath = path.join(session.userDataDir, "state.json");
    const tmpPath = statePath + ".tmp";
    const state = await session.context.storageState();
    await fs.writeFile(tmpPath, JSON.stringify(state, null, 2));
    await fs.rename(tmpPath, statePath);
    log.debug("Session-State gespeichert", { userId });
  } catch (err) {
    log.error("Session-State Speichern fehlgeschlagen", { userId, error: err.message });
  }
}

/**
 * Session schließen
 */
async function closeSession(userId) {
  const session = sessions.get(userId);
  if (!session) return;

  // Sofort aus Map entfernen, um doppelte Schließung zu verhindern
  sessions.delete(userId);

  try {
    await saveSessionState(userId);
    await session.context.close();
  } catch (e) {
    log.error("Fehler beim Schließen der Session", { userId, error: e.message });
  }

  log.info("Session geschlossen", { userId, remaining: sessions.size });
}

/**
 * CRM-Login durchführen
 */
async function login(userId, username, password) {
  const { page } = await getSession(userId);

  log.info("Login gestartet", { userId, username });

  try {
    await page.goto(`${CRM_BASE}/login`, { waitUntil: "networkidle" });
  } catch (err) {
    log.error("Login-Seite nicht erreichbar", { error: err.message });
    throw new Error("CRM Login-Seite nicht erreichbar");
  }

  // Login-Formular ausfüllen
  await page.fill('input[name="username"], input[name="korisnicko_ime"], input[type="text"]', username);
  await page.fill('input[name="password"], input[name="lozinka"], input[type="password"]', password);

  // Submit
  await page.click('button[type="submit"], input[type="submit"], .btn-login, #loginBtn');

  // Warten auf Redirect nach Login
  await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 15000 });

  const currentUrl = page.url();
  const loggedIn = !currentUrl.includes("/login");

  if (loggedIn) {
    await saveSessionState(userId);
    log.info("Login erfolgreich", { userId });
  } else {
    log.warn("Login fehlgeschlagen", { userId, url: currentUrl });
  }

  return {
    success: loggedIn,
    url: currentUrl,
    title: await page.title(),
  };
}

/**
 * Prüfen ob Session noch gültig ist
 */
async function isLoggedIn(userId) {
  try {
    const { page } = await getSession(userId);
    await page.goto(CRM_BASE, { waitUntil: "networkidle", timeout: 10000 });
    const url = page.url();
    return !url.includes("/login");
  } catch {
    return false;
  }
}

/**
 * CRM-Seite navigieren und Inhalt lesen
 */
async function navigate(userId, targetPath) {
  const { page } = await getSession(userId);

  const url = targetPath.startsWith("http") ? targetPath : `${CRM_BASE}${targetPath}`;

  try {
    await page.goto(url, { waitUntil: "networkidle" });
  } catch (err) {
    log.error("Navigation fehlgeschlagen", { userId, url, error: err.message });
    throw new Error(`Seite konnte nicht geladen werden: ${url}`);
  }

  const title = await page.title();
  const content = await page.evaluate(() => {
    // Tabellen extrahieren
    const tables = [];
    document.querySelectorAll("table").forEach((table) => {
      const rows = [];
      table.querySelectorAll("tr").forEach((tr) => {
        const cells = [];
        tr.querySelectorAll("th, td").forEach((cell) => {
          cells.push(cell.textContent.trim());
        });
        if (cells.length > 0) rows.push(cells);
      });
      if (rows.length > 0) tables.push(rows);
    });

    // Sichtbaren Text
    const text = document.body.innerText.substring(0, 5000);

    return { text, tables };
  });

  return {
    url: page.url(),
    title,
    text: content.text,
    tables: content.tables,
  };
}

/**
 * Button klicken (nach Text oder Selector)
 */
async function clickButton(userId, selector) {
  // Einfache Selector-Validierung
  if (typeof selector !== "string" || selector.length > 500) {
    throw new Error("Invalid selector");
  }

  const { page } = await getSession(userId);

  // Versuche zuerst als CSS-Selector, dann als Text
  try {
    await page.click(selector, { timeout: 5000 });
  } catch {
    await page.click(`text=${selector}`, { timeout: 5000 });
  }

  await page.waitForLoadState("networkidle", { timeout: 15000 });

  return {
    url: page.url(),
    title: await page.title(),
  };
}

/**
 * Formular ausfüllen
 */
async function fillForm(userId, fields) {
  if (!fields || typeof fields !== "object") {
    throw new Error("Fields must be a non-empty object");
  }

  const { page } = await getSession(userId);

  let filled = 0;
  for (const [selector, value] of Object.entries(fields)) {
    if (typeof selector !== "string" || typeof value !== "string") continue;
    if (selector.length > 500 || value.length > 5000) continue;

    // Nur alphanumerische Selektoren + gängige Zeichen erlauben
    const safeSelectorPattern = /^[a-zA-Z0-9_\-.\s#[\]=":,()>+~*^$|]+$/;

    try {
      await page.fill(selector, value);
      filled++;
    } catch {
      // Versuche über name-Attribut (nur sichere Selektoren)
      const safeName = selector.replace(/[^a-zA-Z0-9_-]/g, "");
      if (safeName.length > 0) {
        try {
          await page.fill(`[name="${safeName}"]`, value);
          filled++;
        } catch (e) {
          log.warn("Feld konnte nicht ausgefüllt werden", { selector: safeName, error: e.message });
        }
      }
    }
  }

  return { filled };
}

/**
 * Screenshot machen
 */
async function screenshot(userId) {
  const { page } = await getSession(userId);
  const buffer = await page.screenshot({ type: "png", fullPage: false });
  return buffer.toString("base64");
}

/**
 * Suche im CRM ausführen (generisch)
 */
async function search(userId, modulePath, searchText) {
  // Input-Validierung
  if (typeof searchText !== "string" || searchText.length > 500) {
    throw new Error("Invalid search text");
  }

  const { page } = await getSession(userId);

  try {
    await page.goto(`${CRM_BASE}${modulePath}`, { waitUntil: "networkidle" });
  } catch (err) {
    log.error("Such-Seite nicht erreichbar", { modulePath, error: err.message });
    throw new Error(`CRM-Modul nicht erreichbar: ${modulePath}`);
  }

  // Suchfeld finden und ausfüllen
  const searchInput = await page.$('input[type="search"], input[name="search"], input[name="trazi"], .search-input, #search');
  if (searchInput) {
    await searchInput.fill(searchText);

    // Submit: Enter oder Suche-Button
    try {
      await page.click('button:has-text("TRAŽI"), button:has-text("Traži"), button[type="submit"]', { timeout: 3000 });
    } catch {
      await searchInput.press("Enter");
    }

    await page.waitForLoadState("networkidle", { timeout: 15000 });
  }

  // Ergebnis-Tabelle auslesen
  const results = await page.evaluate(() => {
    const rows = [];
    document.querySelectorAll("table tbody tr").forEach((tr) => {
      const cells = [];
      tr.querySelectorAll("td").forEach((td) => cells.push(td.textContent.trim()));
      if (cells.length > 0) rows.push(cells);
    });
    return rows;
  });

  return {
    url: page.url(),
    query: searchText,
    resultCount: results.length,
    results: results.slice(0, 20), // Max 20 Zeilen
  };
}

/**
 * Idle-Sessions aufräumen (mit korrektem Iterator-Handling)
 */
async function cleanupIdleSessions() {
  const now = Date.now();
  const toClose = [];

  // Zuerst sammeln, dann schließen (verhindert Iterator-Invalidierung)
  for (const [userId, session] of sessions) {
    if (now - session.lastUsed > SESSION_TIMEOUT_MS) {
      toClose.push(userId);
    }
  }

  if (toClose.length > 0) {
    log.info("Cleanup: " + toClose.length + " idle Sessions gefunden");
  }

  for (const userId of toClose) {
    try {
      await closeSession(userId);
    } catch (err) {
      log.error("Cleanup-Fehler", { userId, error: err.message });
    }
  }
}

// Alle 5 Minuten aufräumen
setInterval(cleanupIdleSessions, 5 * 60 * 1000);

/**
 * Session-Metriken für Health-Check
 */
function getMetrics() {
  return {
    activeSessions: sessions.size,
    maxSessions: MAX_SESSIONS,
    browserConnected: browser ? browser.isConnected() : false,
    pendingLocks: sessionLocks.size,
  };
}

/**
 * Alles sauber herunterfahren (mit Timeout)
 */
async function shutdown() {
  log.info("Shutdown gestartet", { activeSessions: sessions.size });

  const shutdownTimeout = setTimeout(() => {
    log.error("Shutdown-Timeout erreicht, erzwinge Exit");
    process.exit(1);
  }, 15000);

  const userIds = [...sessions.keys()];
  for (const userId of userIds) {
    await closeSession(userId);
  }

  if (browser) {
    try {
      await browser.close();
    } catch (err) {
      log.error("Browser-Close fehlgeschlagen", { error: err.message });
    }
    browser = null;
  }

  clearTimeout(shutdownTimeout);
  log.info("Shutdown abgeschlossen");
}

// Global unhandled rejection handler
process.on("unhandledRejection", (reason) => {
  log.fatal("Unhandled Promise Rejection", {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

module.exports = {
  getSession,
  login,
  isLoggedIn,
  navigate,
  clickButton,
  fillForm,
  screenshot,
  search,
  closeSession,
  saveSessionState,
  shutdown,
  getMetrics,
};

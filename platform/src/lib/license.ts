/**
 * License-System für CRM Platform
 *
 * License-Key Format: BASE64({ customerId, expiresAt, plan, signature })
 * Remote-Check: Optionaler Ping an LICENSE_SERVER_URL
 * Kill-Switch: Remote-Deaktivierung über Server-Response
 */

import { createHmac } from "crypto";
import { createLogger } from "./logger";

const log = createLogger("license");

// ── Typen ────────────────────────────────────────────────
export interface LicensePayload {
  customerId: string;     // z.B. "client-001"
  customerName: string;   // z.B. "Firma ABC GmbH"
  plan: "starter" | "business" | "enterprise";
  maxUsers: number;       // Max. gleichzeitige User
  expiresAt: string;      // ISO-Datum, z.B. "2027-12-31"
  features: string[];     // z.B. ["chat", "automation", "admin"]
  issuedAt: string;       // Wann ausgestellt
}

export interface LicenseStatus {
  valid: boolean;
  payload: LicensePayload | null;
  error: string | null;
  daysRemaining: number;
  checkedAt: string;
  remoteStatus: "ok" | "revoked" | "unreachable" | "unchecked";
}

// ── Cache ────────────────────────────────────────────────
let cachedStatus: LicenseStatus | null = null;
let lastCheckTime = 0;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 Stunden
const REMOTE_CHECK_INTERVAL_MS = 1 * 60 * 60 * 1000; // 1 Stunde für Remote
let lastRemoteCheckTime = 0;
let validationInProgress: Promise<LicenseStatus> | null = null;

// ── Secret für HMAC-Signatur ─────────────────────────────
function getSecret(): string {
  const secret = process.env.LICENSE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("LICENSE_SECRET muss mindestens 32 Zeichen lang sein");
  }
  return secret;
}

// ── License Key generieren (nur für dich als Herausgeber) ──
export function generateLicenseKey(payload: LicensePayload): string {
  const data = JSON.stringify(payload);
  const signature = createHmac("sha256", getSecret())
    .update(data)
    .digest("hex");

  const keyObj = { ...payload, signature };
  return Buffer.from(JSON.stringify(keyObj)).toString("base64url");
}

// ── License Key parsen und verifizieren ──────────────────
export function parseLicenseKey(key: string): { valid: boolean; payload: LicensePayload | null; error: string | null } {
  try {
    if (!key || typeof key !== "string") {
      return { valid: false, payload: null, error: "Kein License-Key angegeben" };
    }

    // Base64url dekodieren
    const decoded = Buffer.from(key, "base64url").toString("utf-8");
    const keyObj = JSON.parse(decoded);

    // Signatur extrahieren
    const { signature, ...payload } = keyObj;
    if (!signature) {
      return { valid: false, payload: null, error: "Keine Signatur im Key" };
    }

    // HMAC verifizieren
    const expectedSig = createHmac("sha256", getSecret())
      .update(JSON.stringify(payload))
      .digest("hex");

    if (signature !== expectedSig) {
      return { valid: false, payload: null, error: "Ungültige Signatur — Key manipuliert" };
    }

    // Pflichtfelder prüfen
    if (!payload.customerId || !payload.expiresAt || !payload.plan) {
      return { valid: false, payload: null, error: "Key unvollständig" };
    }

    // Ablaufdatum prüfen
    const expiresAt = new Date(payload.expiresAt);
    if (isNaN(expiresAt.getTime())) {
      return { valid: false, payload: null, error: "Ungültiges Ablaufdatum" };
    }

    if (expiresAt < new Date()) {
      return { valid: false, payload: payload as LicensePayload, error: `Lizenz abgelaufen am ${payload.expiresAt}` };
    }

    return { valid: true, payload: payload as LicensePayload, error: null };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, payload: null, error: `Key konnte nicht gelesen werden: ${msg}` };
  }
}

// ── Remote License-Server Check ──────────────────────────
async function checkRemoteLicense(payload: LicensePayload): Promise<"ok" | "revoked" | "unreachable" | "unchecked"> {
  const serverUrl = process.env.LICENSE_SERVER_URL;
  if (!serverUrl) return "unchecked"; // Kein Server konfiguriert → lokal OK

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s Timeout

    const res = await fetch(`${serverUrl}/api/license/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: payload.customerId,
        plan: payload.plan,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      log.warn("License-Server Fehler", { status: res.status });
      return "unreachable";
    }

    const data = await res.json();

    // Server kann die Lizenz widerrufen
    if (data.status === "revoked" || data.active === false) {
      log.error("Lizenz wurde remote deaktiviert!", { customerId: payload.customerId });
      return "revoked";
    }

    return "ok";

  } catch (err: unknown) {
    // Server nicht erreichbar → Lizenz bleibt gültig (Offline-Toleranz)
    log.warn("License-Server nicht erreichbar", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "unreachable";
  }
}

// ── Hauptfunktion: Lizenz prüfen (mit Cache + Mutex) ─────
export async function validateLicense(): Promise<LicenseStatus> {
  const now = Date.now();

  // Cache noch gültig?
  if (cachedStatus && (now - lastCheckTime) < CHECK_INTERVAL_MS) {
    // Remote-Check im Hintergrund (wenn Intervall überschritten)
    if (cachedStatus.valid && (now - lastRemoteCheckTime) > REMOTE_CHECK_INTERVAL_MS) {
      checkRemoteInBackground(cachedStatus.payload!);
    }
    return cachedStatus;
  }

  // Race-Condition vermeiden: Bei parallelen Requests nur einmal validieren
  if (validationInProgress) {
    return validationInProgress;
  }

  validationInProgress = doValidateLicense(now);
  try {
    return await validationInProgress;
  } finally {
    validationInProgress = null;
  }
}

async function doValidateLicense(now: number): Promise<LicenseStatus> {
  const key = process.env.LICENSE_KEY;
  if (!key) {
    cachedStatus = {
      valid: false,
      payload: null,
      error: "LICENSE_KEY nicht konfiguriert",
      daysRemaining: 0,
      checkedAt: new Date().toISOString(),
      remoteStatus: "unchecked",
    };
    lastCheckTime = now;
    return cachedStatus;
  }

  // Lokale Validierung
  const result = parseLicenseKey(key);

  // Tage bis Ablauf berechnen
  let daysRemaining = 0;
  if (result.payload?.expiresAt) {
    const diff = new Date(result.payload.expiresAt).getTime() - now;
    daysRemaining = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  // Remote-Check wenn lokal gültig
  let remoteStatus: LicenseStatus["remoteStatus"] = "unchecked";
  if (result.valid && result.payload) {
    remoteStatus = await checkRemoteLicense(result.payload);
    lastRemoteCheckTime = now;

    // Wenn remote widerrufen → ungültig
    if (remoteStatus === "revoked") {
      result.valid = false;
      result.error = "Lizenz wurde vom Herausgeber deaktiviert";
    }
  }

  cachedStatus = {
    valid: result.valid,
    payload: result.payload,
    error: result.error,
    daysRemaining,
    checkedAt: new Date().toISOString(),
    remoteStatus,
  };

  lastCheckTime = now;

  // Warnungen loggen
  if (!result.valid) {
    log.error("Lizenz ungültig", { error: result.error });
  } else if (daysRemaining <= 30) {
    log.warn(`Lizenz läuft in ${daysRemaining} Tagen ab`, {
      customerId: result.payload?.customerId,
      expiresAt: result.payload?.expiresAt,
    });
  }

  return cachedStatus;
}

// ── Background Remote-Check ──────────────────────────────
function checkRemoteInBackground(payload: LicensePayload) {
  lastRemoteCheckTime = Date.now();
  checkRemoteLicense(payload).then((status) => {
    if (cachedStatus && status === "revoked") {
      cachedStatus.valid = false;
      cachedStatus.remoteStatus = "revoked";
      cachedStatus.error = "Lizenz wurde vom Herausgeber deaktiviert";
      log.error("Lizenz remote deaktiviert!", { customerId: payload.customerId });
    } else if (cachedStatus) {
      cachedStatus.remoteStatus = status;
    }
  }).catch((err: unknown) => {
    log.warn("Background License-Check fehlgeschlagen", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

// ── Cache zurücksetzen (z.B. nach Key-Änderung) ─────────
export function resetLicenseCache() {
  cachedStatus = null;
  lastCheckTime = 0;
  lastRemoteCheckTime = 0;
}

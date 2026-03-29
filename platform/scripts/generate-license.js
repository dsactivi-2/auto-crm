#!/usr/bin/env node
/**
 * License-Key Generator für CRM Platform
 *
 * Nutzung:
 *   node generate-license.js
 *
 * Oder mit Parametern:
 *   node generate-license.js --customer "Firma ABC" --id "client-001" --plan business --users 10 --months 12
 *
 * Benötigt: LICENSE_SECRET Umgebungsvariable (oder --secret Parameter)
 */

const { createHmac, randomBytes } = require("crypto");

// ── Parameter parsen ─────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      const key = args[i].replace("--", "");
      params[key] = args[++i];
    }
  }

  return params;
}

// ── Interaktiver Modus ───────────────────────────────────
async function prompt(question, defaultVal) {
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    const suffix = defaultVal ? ` [${defaultVal}]` : "";
    rl.question(`  ${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

async function main() {
  const params = parseArgs();

  console.log("");
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   CRM Platform — License Key Generator   ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("");

  // Secret
  let secret = params.secret || process.env.LICENSE_SECRET;
  if (!secret) {
    console.log("  Kein LICENSE_SECRET gefunden.");
    console.log("  Generiere ein neues Secret...");
    secret = randomBytes(32).toString("hex");
    console.log("");
    console.log(`  ⚠ NEUES SECRET (in .env speichern!):`);
    console.log(`  LICENSE_SECRET=${secret}`);
    console.log("");
  }

  // Kunden-Daten
  const customerId = params.id || await prompt("Kunden-ID", `client-${Date.now().toString(36)}`);
  const customerName = params.customer || await prompt("Kundenname", "Demo-Kunde");
  const plan = params.plan || await prompt("Plan (starter/business/enterprise)", "business");
  const maxUsers = parseInt(params.users || await prompt("Max. User", "5"));
  const months = parseInt(params.months || await prompt("Laufzeit in Monaten", "12"));
  const features = (params.features || await prompt("Features (komma-getrennt)", "chat,automation,admin")).split(",").map(f => f.trim());

  // Ablaufdatum berechnen
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  // Payload
  const payload = {
    customerId,
    customerName,
    plan,
    maxUsers,
    expiresAt: expiresAt.toISOString().split("T")[0], // YYYY-MM-DD
    features,
    issuedAt: now.toISOString().split("T")[0],
  };

  // HMAC-Signatur
  const data = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(data).digest("hex");

  // Base64url-Key
  const keyObj = { ...payload, signature };
  const licenseKey = Buffer.from(JSON.stringify(keyObj)).toString("base64url");

  // Ausgabe
  console.log("");
  console.log("─────────────────────────────────────────────");
  console.log("  LIZENZ ERSTELLT");
  console.log("─────────────────────────────────────────────");
  console.log("");
  console.log(`  Kunde:      ${customerName} (${customerId})`);
  console.log(`  Plan:       ${plan}`);
  console.log(`  Max. User:  ${maxUsers}`);
  console.log(`  Features:   ${features.join(", ")}`);
  console.log(`  Gültig bis: ${payload.expiresAt}`);
  console.log(`  Ausgestellt: ${payload.issuedAt}`);
  console.log("");
  console.log("  ── Für .env Datei ──────────────────────");
  console.log("");
  console.log(`  LICENSE_KEY=${licenseKey}`);
  console.log(`  LICENSE_SECRET=${secret}`);
  console.log("");
  console.log("─────────────────────────────────────────────");
  console.log("");

  // Optional: Auch als JSON ausgeben
  if (params.json) {
    console.log("  JSON:");
    console.log(JSON.stringify({ licenseKey, secret, payload }, null, 2));
  }
}

main().catch(console.error);

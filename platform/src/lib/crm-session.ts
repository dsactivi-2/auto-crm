/**
 * CRM Session Manager
 * ====================
 * Stellt sicher, dass ein User im CRM eingeloggt ist,
 * bevor Aktionen ausgeführt werden.
 */

import { decrypt } from "./encryption";
import * as pw from "./playwright-client";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Prüft ob User im CRM eingeloggt ist.
 * Wenn nicht, versucht Auto-Login mit gespeicherten Credentials.
 * Gibt { ready, message } zurück.
 */
export async function ensureCrmSession(userId: string): Promise<{ ready: boolean; message: string }> {
  // 1. Prüfe ob Playwright-Service erreichbar
  const serviceUp = await pw.crmHealth();
  if (!serviceUp) {
    return { ready: false, message: "CRM-Service ist nicht erreichbar. Bitte stelle sicher, dass der Playwright-Service läuft." };
  }

  // 2. Credentials laden
  const { data: creds } = await supabaseAdmin
    .from("crm_credentials")
    .select("crm_username, crm_password_encrypted, is_valid")
    .eq("user_id", userId)
    .single();

  if (!creds) {
    return { ready: false, message: "Keine CRM-Zugangsdaten hinterlegt. Bitte trage deine Zugangsdaten im Dashboard ein." };
  }

  if (creds.is_valid === false) {
    return { ready: false, message: "Deine CRM-Zugangsdaten sind als ungültig markiert. Bitte aktualisiere sie im Dashboard." };
  }

  // 3. Versuche Auto-Login
  try {
    const password = decrypt(creds.crm_password_encrypted);
    const result = await pw.crmLogin(userId, creds.crm_username, password);

    if (result.success) {
      // Credentials als gültig markieren
      await supabaseAdmin
        .from("crm_credentials")
        .update({ is_valid: true, last_validated_at: new Date().toISOString() })
        .eq("user_id", userId);

      return { ready: true, message: "CRM-Session aktiv." };
    } else {
      // Credentials als ungültig markieren
      await supabaseAdmin
        .from("crm_credentials")
        .update({ is_valid: false })
        .eq("user_id", userId);

      return { ready: false, message: "CRM-Login fehlgeschlagen. Bitte überprüfe deine Zugangsdaten." };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ready: false, message: `CRM-Verbindungsfehler: ${message}` };
  }
}

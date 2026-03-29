import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { decrypt } from "@/lib/encryption";
import * as pw from "@/lib/playwright-client";
import { createLogger } from "@/lib/logger";
import { credentialsLimiter } from "@/lib/rate-limit";

const log = createLogger("api/credentials/test");

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabase();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    // Rate Limiting (nutzt gleichen Limiter wie Credentials)
    const rateCheck = credentialsLimiter.check(session.user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warte einen Moment." },
        { status: 429 }
      );
    }

    // Prüfe ob Playwright-Service erreichbar
    const serviceAvailable = await pw.crmHealth();
    if (!serviceAvailable) {
      return NextResponse.json(
        { success: false, error: "CRM-Service nicht erreichbar. Bitte prüfe ob Docker läuft." },
        { status: 503 }
      );
    }

    // Credentials aus Body oder aus DB laden
    const body = await request.json().catch(() => null);
    let username: string | undefined;
    let password: string | undefined;

    if (body?.username && body?.password) {
      // Direkt übergebene Credentials testen
      username = body.username;
      password = body.password;
    } else {
      // Gespeicherte Credentials aus DB laden
      const { data: creds } = await supabase
        .from("crm_credentials")
        .select("crm_username, crm_password_encrypted")
        .eq("user_id", session.user.id)
        .single();

      if (!creds?.crm_password_encrypted) {
        return NextResponse.json(
          { success: false, error: "Keine CRM-Zugangsdaten gespeichert." },
          { status: 400 }
        );
      }

      username = creds.crm_username;
      password = decrypt(creds.crm_password_encrypted);
    }

    // Login testen via Playwright
    const result = await pw.crmValidate(session.user.id, username!, password!);

    if (result.success) {
      // Credentials als gültig markieren
      await supabase
        .from("crm_credentials")
        .update({ is_valid: true, last_validated_at: new Date().toISOString() })
        .eq("user_id", session.user.id);

      // Activity loggen
      await supabase.from("activities").insert({
        user_id: session.user.id,
        action: "CRM-Login Test erfolgreich",
        module: "System",
        details: { username },
        status: "success",
      });

      return NextResponse.json({ success: true, message: "Login erfolgreich! Zugangsdaten sind gültig." });
    } else {
      // Credentials als ungültig markieren
      await supabase
        .from("crm_credentials")
        .update({ is_valid: false, last_validated_at: new Date().toISOString() })
        .eq("user_id", session.user.id);

      return NextResponse.json({
        success: false,
        error: result.error || "Login fehlgeschlagen. Benutzername oder Passwort falsch.",
      });
    }
  } catch (err: unknown) {
    log.error("Login-Test Fehler", log.fromError(err));
    const message = err instanceof Error ? err.message : "Interner Fehler";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

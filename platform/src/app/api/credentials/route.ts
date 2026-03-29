import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { encrypt } from "@/lib/encryption";
import { createLogger } from "@/lib/logger";
import { credentialsLimiter } from "@/lib/rate-limit";

const log = createLogger("api/credentials");

const DEFAULT_CRM_URL = "https://crm.job-step.com";

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabase();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    // Rate Limiting
    const rateCheck = credentialsLimiter.check(session.user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warte einen Moment." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.resetIn / 1000)) } }
      );
    }

    // CSRF-Schutz
    const origin = request.headers.get("origin");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (origin && appUrl && !origin.startsWith(appUrl)) {
      return NextResponse.json({ error: "Ungültige Anfrage-Herkunft" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
    }
    const { username, password, crmUrl, anthropicApiKey, preferredModel } = body;

    if (!username) {
      return NextResponse.json({ error: "Benutzername erforderlich" }, { status: 400 });
    }

    // Anthropic Key Validierung (wenn angegeben)
    if (anthropicApiKey && !anthropicApiKey.startsWith("sk-ant-")) {
      return NextResponse.json({ error: "Ungültiger Anthropic API Key (muss mit sk-ant- beginnen)" }, { status: 400 });
    }

    const encryptedPassword = password ? encrypt(password) : undefined;
    const encryptedAnthropicKey = anthropicApiKey ? encrypt(anthropicApiKey) : undefined;

    // Upsert: Insert oder Update in einer atomischen Operation
    const upsertData: Record<string, unknown> = {
      user_id: session.user.id,
      crm_username: username,
      crm_url: crmUrl || DEFAULT_CRM_URL,
      is_valid: null, // Reset validation
    };

    if (encryptedPassword) {
      upsertData.crm_password_encrypted = encryptedPassword;
    }

    if (encryptedAnthropicKey) {
      upsertData.anthropic_api_key_encrypted = encryptedAnthropicKey;
    }

    // Modell-Auswahl validieren und speichern
    const allowedModels = ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-4-5-20251001"];
    if (preferredModel) {
      if (!allowedModels.includes(preferredModel)) {
        return NextResponse.json({ error: "Ungültiges Modell" }, { status: 400 });
      }
      upsertData.preferred_model = preferredModel;
    }

    // Prüfe ob bereits Credentials existieren
    const { data: existing } = await supabase
      .from("crm_credentials")
      .select("id")
      .eq("user_id", session.user.id)
      .single();

    if (existing) {
      const { error } = await supabase
        .from("crm_credentials")
        .update(upsertData)
        .eq("user_id", session.user.id);
      if (error) throw error;
    } else {
      // Neuer Eintrag: Passwort ist Pflicht
      if (!encryptedPassword) {
        return NextResponse.json({ error: "Passwort erforderlich" }, { status: 400 });
      }
      const { error } = await supabase
        .from("crm_credentials")
        .insert(upsertData);
      if (error) throw error;
    }

    // Activity loggen
    await supabase.from("activities").insert({
      user_id: session.user.id,
      action: "CRM-Zugangsdaten gespeichert",
      module: "System",
      details: { username },
      status: "success",
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    log.error("Credentials-Fehler", log.fromError(err));
    const message = err instanceof Error ? err.message : "Interner Fehler";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { encrypt } from "@/lib/encryption";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/credentials");

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabase();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    const { username, password, crmUrl } = await request.json();

    if (!username) {
      return NextResponse.json({ error: "Benutzername erforderlich" }, { status: 400 });
    }

    const encryptedPassword = password ? encrypt(password) : undefined;

    // Upsert: Insert oder Update in einer atomischen Operation
    const upsertData: Record<string, unknown> = {
      user_id: session.user.id,
      crm_username: username,
      crm_url: crmUrl || "https://crm.job-step.com",
      is_valid: null, // Reset validation
    };

    if (encryptedPassword) {
      upsertData.crm_password_encrypted = encryptedPassword;
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

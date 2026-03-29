import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/admin");

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabase();

    // Prüfe ob der anfragende User ein Admin ist
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Nur Admins dürfen User erstellen" }, { status: 403 });
    }

    const { email, password, fullName, role } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "E-Mail und Passwort erforderlich" }, { status: 400 });
    }

    // Input-Validierung
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
    }
    if (typeof password !== "string" || password.trim().length < 6) {
      return NextResponse.json({ error: "Passwort muss mindestens 6 Zeichen lang sein" }, { status: 400 });
    }
    if (role && !["user", "admin"].includes(role)) {
      return NextResponse.json({ error: "Rolle muss 'user' oder 'admin' sein" }, { status: 400 });
    }
    if (fullName && (typeof fullName !== "string" || fullName.length > 200)) {
      return NextResponse.json({ error: "Name zu lang (max 200 Zeichen)" }, { status: 400 });
    }

    // Service-Role Client für Admin-Operationen
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // User erstellen
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Sofort bestätigen
      user_metadata: { full_name: fullName || "" },
    });

    if (createError) throw createError;

    // Rolle aktualisieren (falls nicht 'user')
    if (role === "admin" && newUser.user) {
      await adminClient
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", newUser.user.id);
    }

    // Activity loggen
    await supabase.from("activities").insert({
      user_id: session.user.id,
      action: `User erstellt: ${email} (${role})`,
      module: "Admin",
      details: { new_user_email: email, role },
      status: "success",
    });

    return NextResponse.json({ success: true, userId: newUser.user?.id });
  } catch (err: unknown) {
    log.error("User-Erstellung fehlgeschlagen", log.fromError(err));
    const message = err instanceof Error ? err.message : "Interner Fehler";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

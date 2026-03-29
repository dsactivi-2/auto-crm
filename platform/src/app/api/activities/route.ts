import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/activities");

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabase();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const module = searchParams.get("module");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50") || 50, 1), 200);

    // Admin-Check für fremde User-Daten
    if (userId && userId !== session.user.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (!profile || profile.role !== "admin") {
        return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
      }
    }

    let query = supabase
      .from("activities")
      .select("*, profiles(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (userId) query = query.eq("user_id", userId);
    if (module) query = query.eq("module", module);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ activities: data });
  } catch (err: unknown) {
    log.error("Activities-Abfrage fehlgeschlagen", log.fromError(err));
    const message = err instanceof Error ? err.message : "Interner Fehler";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

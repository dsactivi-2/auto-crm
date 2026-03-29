import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

// GET /api/live-jobs — Letzte Aktivitäten als "Live Jobs"
export async function GET() {
  try {
    const supabase = createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    // Letzte 20 Aktivitäten laden (neueste zuerst)
    const { data: activities, error } = await supabase
      .from("activities")
      .select("id, action, module, details, status, error_message, duration_ms, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    // Screenshot des aktuellen Browser-Zustands (optional, nur wenn Session aktiv)
    return NextResponse.json({
      jobs: activities || [],
      user_id: session.user.id,
      fetched_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Fehler" },
      { status: 500 }
    );
  }
}

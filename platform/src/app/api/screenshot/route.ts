import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import * as pw from "@/lib/playwright-client";

export async function POST() {
  try {
    const supabase = createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    const serviceAvailable = await pw.crmHealth();
    if (!serviceAvailable) {
      return NextResponse.json({ error: "CRM-Service nicht erreichbar" }, { status: 503 });
    }

    const result = await pw.crmScreenshot(session.user.id);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fehler" },
      { status: 500 }
    );
  }
}

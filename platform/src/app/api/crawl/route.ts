import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import * as pw from "@/lib/playwright-client";
import { createLogger } from "@/lib/logger";
import { chatLimiter } from "@/lib/rate-limit";

const log = createLogger("api/crawl");

export async function POST() {
  try {
    const supabase = createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    const rateCheck = chatLimiter.check(session.user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: "Zu viele Anfragen" }, { status: 429 });
    }

    // Playwright-Service prüfen
    const serviceAvailable = await pw.crmHealth();
    if (!serviceAvailable) {
      return NextResponse.json(
        { error: "CRM-Service nicht erreichbar." },
        { status: 503 }
      );
    }

    // CRM-URL aus Credentials laden
    const { data: creds } = await supabase
      .from("crm_credentials")
      .select("crm_url")
      .eq("user_id", session.user.id)
      .single();

    const result = await pw.crmCrawl(session.user.id, creds?.crm_url);

    if (result.success !== false) {
      // Activity loggen
      await supabase.from("activities").insert({
        user_id: session.user.id,
        action: "CRM-Struktur gecrawlt",
        module: "System",
        details: {
          modules_found: result.modules_found,
          duration_ms: result.duration_ms,
        },
        status: "success",
        duration_ms: result.duration_ms,
      });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    log.error("Crawl-Fehler", log.fromError(err));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Fehler" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import * as pw from "@/lib/playwright-client";

export async function GET() {
  try {
    const playwrightOk = await pw.crmHealth();

    return NextResponse.json({
      status: "ok",
      service: "crm-platform",
      timestamp: new Date().toISOString(),
      playwright: playwrightOk ? "connected" : "offline",
      env: {
        supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        encryption: !!process.env.CREDENTIALS_ENCRYPTION_KEY,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: "error", error: message },
      { status: 500 }
    );
  }
}

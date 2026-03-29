import { createServerSupabase } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth/callback");

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = `${origin}/dashboard`;

  if (!code) {
    log.warn("Auth callback ohne code-Parameter aufgerufen");
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  try {
    const supabase = createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      log.error("Code-Exchange fehlgeschlagen", { error: error.message });
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Auth callback Fehler", { error: message });
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  return NextResponse.redirect(redirectTo);
}

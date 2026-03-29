import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ── License-Check (läuft in Edge Runtime) ────────────────
async function checkLicense(): Promise<{ valid: boolean; error: string | null }> {
  const key = process.env.LICENSE_KEY;
  const secret = process.env.LICENSE_SECRET;

  if (!key || !secret) {
    return { valid: false, error: "LICENSE_KEY oder LICENSE_SECRET nicht konfiguriert" };
  }

  try {
    // Base64url dekodieren
    const decoded = Buffer.from(key, "base64url").toString("utf-8");
    const keyObj = JSON.parse(decoded);
    const { signature, ...payload } = keyObj;

    if (!signature) {
      return { valid: false, error: "Keine Signatur" };
    }

    // HMAC verifizieren (Edge-kompatibel via Web Crypto)
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(JSON.stringify(payload)));
    const expectedSig = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (signature !== expectedSig) {
      return { valid: false, error: "Ungültige Signatur" };
    }

    // Ablaufdatum
    const expiresAt = new Date(payload.expiresAt);
    if (expiresAt < new Date()) {
      return { valid: false, error: `Lizenz abgelaufen am ${payload.expiresAt}` };
    }

    return { valid: true, error: null };

  } catch {
    return { valid: false, error: "License-Key ungültig" };
  }
}

// ── Sperrseite HTML ──────────────────────────────────────
function blockedResponse(error: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lizenz erforderlich</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      max-width: 480px;
      padding: 2rem;
    }
    .lock-icon {
      width: 80px; height: 80px;
      margin: 0 auto 1.5rem;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.5rem;
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.75rem; color: #f8fafc; }
    p { color: #94a3b8; line-height: 1.6; margin-bottom: 1rem; }
    .error-box {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
      color: #fca5a5;
      margin-top: 1.5rem;
    }
    .contact {
      margin-top: 2rem;
      font-size: 0.85rem;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="lock-icon">&#128274;</div>
    <h1>Lizenz erforderlich</h1>
    <p>
      Diese CRM-Platform ist lizenzpflichtig.
      Bitte kontaktieren Sie den Herausgeber um eine gültige Lizenz zu erhalten.
    </p>
    <div class="error-box">${error}</div>
    <div class="contact">
      Bei Fragen wenden Sie sich an den Administrator.
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 403,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ── Middleware ────────────────────────────────────────────
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Health-Endpoint immer erlauben (für Docker Healthcheck)
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  // License-Status API immer erlauben (für Admin-Diagnose)
  if (pathname === "/api/license") {
    return NextResponse.next();
  }

  // ── License-Check ──────────────────────────────────────
  const license = await checkLicense();
  if (!license.valid) {
    // API-Routen bekommen JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Lizenz ungültig", detail: license.error },
        { status: 403 }
      );
    }
    // Alles andere bekommt die Sperrseite
    return blockedResponse(license.error || "Keine gültige Lizenz");
  }

  // ── Ab hier: Lizenz gültig → normaler Auth-Flow ────────
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  // Geschützte Routen
  const protectedPaths = ["/dashboard", "/admin", "/api/chat", "/api/credentials", "/api/activities", "/api/admin"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Bereits eingeloggt → nicht zur Login-Seite
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Admin-Routen: nur für Admins
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (session) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (!profile || profile.role !== "admin") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/login",
    "/api/chat",
    "/api/credentials",
    "/api/activities",
    "/api/admin/:path*",
    "/api/health",
    "/api/license",
    // Root-Seite auch schützen
    "/",
  ],
};

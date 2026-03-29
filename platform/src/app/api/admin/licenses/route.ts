import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createHmac, randomBytes } from "crypto";
import { adminLimiter } from "@/lib/rate-limit";

// ── Helper: Admin-Check ─────────────────────────────────────────────────────
async function requireAdmin(supabase: ReturnType<typeof createServerSupabase>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (profile?.role !== "admin") return null;
  return session;
}

// ── Helper: License Key generieren ─────────────────────────────────────────
function generateLicenseKey(params: {
  customerId: string;
  customerName: string;
  plan: string;
  maxUsers: number;
  expiresAt: string;
  features: string[];
  issuedAt: string;
}): string {
  const secret = process.env.LICENSE_SECRET || randomBytes(32).toString("hex");
  const payload = { ...params };
  const data = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(data).digest("hex");
  const keyObj = { ...payload, signature };
  return Buffer.from(JSON.stringify(keyObj)).toString("base64url");
}

// ── GET /api/admin/licenses — Alle Lizenzen auflisten ───────────────────────
export async function GET() {
  try {
    const supabase = createServerSupabase();
    const session = await requireAdmin(supabase);
    if (!session) {
      return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
    }

    const rateCheck = adminLimiter.check(session.user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: "Zu viele Anfragen" }, { status: 429 });
    }

    const { data, error } = await supabase
      .from("licenses")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ licenses: data || [] });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Fehler" },
      { status: 500 }
    );
  }
}

// ── POST /api/admin/licenses — Neue Lizenz erstellen ───────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const session = await requireAdmin(supabase);
    if (!session) {
      return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
    }

    const rateCheck = adminLimiter.check(session.user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: "Zu viele Anfragen" }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
    }

    const {
      customer_id,
      customer_name,
      plan,
      max_users = 5,
      features = ["chat", "automation", "admin"],
      months = 12,
      notes,
    } = body;

    if (!customer_id || !customer_name || !plan) {
      return NextResponse.json(
        { error: "customer_id, customer_name und plan sind erforderlich" },
        { status: 400 }
      );
    }

    if (!["starter", "business", "enterprise"].includes(plan)) {
      return NextResponse.json(
        { error: "Ungültiger Plan. Erlaubt: starter, business, enterprise" },
        { status: 400 }
      );
    }

    const now = new Date();
    const issuedAt = now.toISOString().split("T")[0];
    const expiresDate = new Date(now);
    expiresDate.setMonth(expiresDate.getMonth() + months);
    const expiresAt = expiresDate.toISOString().split("T")[0];

    const licenseKey = generateLicenseKey({
      customerId: customer_id,
      customerName: customer_name,
      plan,
      maxUsers: max_users,
      expiresAt,
      features,
      issuedAt,
    });

    const { data, error } = await supabase
      .from("licenses")
      .insert({
        customer_id,
        customer_name,
        plan,
        max_users,
        features,
        license_key: licenseKey,
        issued_at: issuedAt,
        expires_at: expiresAt,
        is_active: true,
        notes: notes || null,
        created_by: session.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Activity loggen
    await supabase.from("activities").insert({
      user_id: session.user.id,
      action: `Lizenz erstellt für ${customer_name}`,
      module: "System",
      details: { customer_id, plan, expires_at: expiresAt },
      status: "success",
    });

    return NextResponse.json({ license: data, license_key: licenseKey }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Fehler" },
      { status: 500 }
    );
  }
}

// ── PATCH /api/admin/licenses — Lizenz widerrufen/reaktivieren ─────────────
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const session = await requireAdmin(supabase);
    if (!session) {
      return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body?.id) {
      return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
    }

    const { id, is_active } = body;

    const { data, error } = await supabase
      .from("licenses")
      .update({ is_active: !!is_active, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await supabase.from("activities").insert({
      user_id: session.user.id,
      action: `Lizenz ${is_active ? "reaktiviert" : "widerrufen"}: ${data?.customer_name}`,
      module: "System",
      details: { license_id: id, is_active: !!is_active },
      status: "success",
    });

    return NextResponse.json({ license: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Fehler" },
      { status: 500 }
    );
  }
}

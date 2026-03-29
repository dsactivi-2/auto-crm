import { NextResponse } from "next/server";
import { validateLicense, resetLicenseCache } from "@/lib/license";
import { createServerSupabase } from "@/lib/supabase-server";

// GET /api/license — Lizenz-Status abfragen (nur Admin)
export async function GET() {
  try {
    const supabase = createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      // Ohne Auth → nur basic Info
      const status = await validateLicense();
      return NextResponse.json({
        valid: status.valid,
        error: status.error,
        daysRemaining: status.daysRemaining,
      });
    }

    // Admin bekommt volle Details
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();

    if (profile?.role === "admin") {
      const status = await validateLicense();
      return NextResponse.json({
        valid: status.valid,
        payload: status.payload,
        error: status.error,
        daysRemaining: status.daysRemaining,
        remoteStatus: status.remoteStatus,
        checkedAt: status.checkedAt,
      });
    }

    // Normaler User → basic Info
    const status = await validateLicense();
    return NextResponse.json({
      valid: status.valid,
      daysRemaining: status.daysRemaining,
    });

  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Fehler" },
      { status: 500 }
    );
  }
}

// POST /api/license — Cache zurücksetzen (nur Admin)
export async function POST() {
  try {
    const supabase = createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Nur für Admins" }, { status: 403 });
    }

    resetLicenseCache();
    const status = await validateLicense();

    return NextResponse.json({
      message: "License-Cache zurückgesetzt",
      status,
    });

  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Fehler" },
      { status: 500 }
    );
  }
}

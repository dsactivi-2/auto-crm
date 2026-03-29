"use client";

import { useEffect, useState } from "react";

interface LicensePayload {
  customerId: string;
  customerName: string;
  plan: string;
  maxUsers: number;
  expiresAt: string;
  features: string[];
  issuedAt: string;
}

interface LicenseInfo {
  valid: boolean;
  payload: LicensePayload | null;
  error: string | null;
  daysRemaining: number;
  remoteStatus: string;
  checkedAt: string;
}

export default function LicenseManager() {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  async function fetchLicense() {
    try {
      setFetchError(false);
      const res = await fetch("/api/license");
      const data = await res.json();
      setLicense(data);
    } catch {
      setLicense(null);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }

  async function refreshCache() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/license", { method: "POST" });
      const data = await res.json();
      if (data.status) setLicense(data.status);
      else await fetchLicense();
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchLicense();
  }, []);

  if (loading) {
    return <div className="text-sm text-gray-400 animate-pulse">Lizenz wird geladen...</div>;
  }

  if (fetchError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
        <p className="text-sm text-red-600">Lizenz-Status konnte nicht abgerufen werden.</p>
        <button onClick={fetchLicense} className="mt-2 text-xs text-red-500 underline hover:text-red-700">
          Erneut versuchen
        </button>
      </div>
    );
  }

  const p = license?.payload;
  const daysLeft = license?.daysRemaining ?? 0;

  // Farben je nach Status
  const statusColor = !license?.valid
    ? "bg-red-50 border-red-200"
    : daysLeft <= 30
      ? "bg-amber-50 border-amber-200"
      : "bg-green-50 border-green-200";

  const statusDot = !license?.valid
    ? "bg-red-500"
    : daysLeft <= 30
      ? "bg-amber-500"
      : "bg-green-500";

  const statusText = !license?.valid
    ? "Ungültig"
    : daysLeft <= 30
      ? "Läuft bald ab"
      : "Aktiv";

  const planBadge: Record<string, string> = {
    starter: "bg-gray-100 text-gray-600",
    business: "bg-blue-100 text-blue-700",
    enterprise: "bg-purple-100 text-purple-700",
  };

  const remoteBadge: Record<string, { bg: string; text: string }> = {
    ok: { bg: "bg-green-100", text: "Verbunden" },
    revoked: { bg: "bg-red-100", text: "Widerrufen" },
    unreachable: { bg: "bg-amber-100", text: "Nicht erreichbar" },
    unchecked: { bg: "bg-gray-100", text: "Kein Server" },
  };

  const remote = remoteBadge[license?.remoteStatus || "unchecked"] || remoteBadge.unchecked;

  return (
    <div className="space-y-4">
      {/* Status-Banner */}
      <div className={`rounded-xl border p-4 ${statusColor}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${statusDot} animate-pulse`} />
            <div>
              <span className="text-sm font-semibold text-gray-800">{statusText}</span>
              {license?.error && (
                <p className="text-xs text-red-600 mt-0.5">{license.error}</p>
              )}
            </div>
          </div>
          <button
            onClick={refreshCache}
            disabled={refreshing}
            className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {refreshing ? "Prüfe..." : "Neu prüfen"}
          </button>
        </div>
      </div>

      {/* Lizenz-Details */}
      {p ? (
        <div className="space-y-3">
          {/* Kunde + Plan */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-lg border border-gray-100 p-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Kunde</p>
              <p className="text-sm font-semibold text-gray-800">{p.customerName}</p>
              <p className="text-xs text-gray-400 mt-0.5">{p.customerId}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Plan</p>
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${planBadge[p.plan] || planBadge.starter}`}>
                {p.plan.charAt(0).toUpperCase() + p.plan.slice(1)}
              </span>
              <p className="text-xs text-gray-400 mt-1">Max. {p.maxUsers} User</p>
            </div>
          </div>

          {/* Laufzeit */}
          <div className="bg-white rounded-lg border border-gray-100 p-3">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-2">Laufzeit</p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{p.issuedAt}</span>
              <span className="text-xs text-gray-500">{p.expiresAt}</span>
            </div>
            {/* Progress-Bar */}
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  daysLeft <= 30 ? "bg-amber-400" : "bg-green-400"
                }`}
                style={{
                  width: `${Math.max(5, Math.min(100, 100 - (daysLeft / 365) * 100))}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-gray-400">Ausgestellt</span>
              <span className={`text-xs font-medium ${daysLeft <= 30 ? "text-amber-600" : "text-green-600"}`}>
                {daysLeft} Tage verbleibend
              </span>
            </div>
          </div>

          {/* Features */}
          <div className="bg-white rounded-lg border border-gray-100 p-3">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-2">Features</p>
            <div className="flex flex-wrap gap-1.5">
              {p.features.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded-md border border-gray-100"
                >
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Remote-Status + Letzte Prüfung */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-lg border border-gray-100 p-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Remote-Server</p>
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${remote.bg}`}>
                {remote.text}
              </span>
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Letzte Prüfung</p>
              <p className="text-xs text-gray-600">
                {license.checkedAt
                  ? new Date(license.checkedAt).toLocaleString("de-DE")
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Kein Key */
        <div className="bg-white rounded-lg border border-gray-100 p-4 text-center">
          <p className="text-sm text-gray-500">Kein License-Key konfiguriert.</p>
          <p className="text-xs text-gray-400 mt-1">
            Setze <code className="bg-gray-50 px-1.5 py-0.5 rounded text-[11px]">LICENSE_KEY</code> und{" "}
            <code className="bg-gray-50 px-1.5 py-0.5 rounded text-[11px]">LICENSE_SECRET</code> in der .env Datei.
          </p>
        </div>
      )}
    </div>
  );
}

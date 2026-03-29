"use client";

import { useEffect, useState } from "react";

interface License {
  id: string;
  customer_id: string;
  customer_name: string;
  plan: "starter" | "business" | "enterprise";
  max_users: number;
  features: string[];
  license_key: string;
  issued_at: string;
  expires_at: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-600",
  business: "bg-blue-100 text-blue-700",
  enterprise: "bg-purple-100 text-purple-700",
};

const DEFAULT_FEATURES_BY_PLAN: Record<string, string[]> = {
  starter: ["chat"],
  business: ["chat", "automation", "admin"],
  enterprise: ["chat", "automation", "admin", "api", "white-label"],
};

export default function LicenseAdminManager() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [plan, setPlan] = useState<"starter" | "business" | "enterprise">("business");
  const [maxUsers, setMaxUsers] = useState(5);
  const [months, setMonths] = useState(12);
  const [featuresInput, setFeaturesInput] = useState("chat,automation,admin");
  const [notes, setNotes] = useState("");
  const [createError, setCreateError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/admin/licenses");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLicenses(data.licenses || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Auto-fill features when plan changes
  useEffect(() => {
    setFeaturesInput(DEFAULT_FEATURES_BY_PLAN[plan]?.join(",") || "chat");
  }, [plan]);

  async function createLicense(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setCreateError("");
    setNewKey(null);

    try {
      const features = featuresInput.split(",").map((f) => f.trim()).filter(Boolean);
      const res = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          customer_name: customerName,
          plan,
          max_users: maxUsers,
          months,
          features,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setNewKey(data.license_key);
      setShowCreate(false);
      setCustomerId("");
      setCustomerName("");
      setPlan("business");
      setMaxUsers(5);
      setMonths(12);
      setNotes("");
      await load();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, currentActive: boolean) {
    setRevoking(id);
    try {
      const res = await fetch("/api/admin/licenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !currentActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLicenses((prev) =>
        prev.map((l) => (l.id === id ? { ...l, is_active: !currentActive } : l))
      );
    } catch {
      // ignore
    } finally {
      setRevoking(null);
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key).catch(() => {});
  }

  function getDaysRemaining(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  if (loading) {
    return <div className="text-sm text-gray-400 animate-pulse p-4">Lizenzen laden...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">Lizenz-Verwaltung</h3>
          <p className="text-xs text-gray-400 mt-0.5">{licenses.length} Lizenz{licenses.length !== 1 ? "en" : ""} insgesamt</p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setNewKey(null); setCreateError(""); }}
          className="btn-primary text-sm"
        >
          + Neue Lizenz
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      )}

      {/* Neue Lizenz erstellt — Key anzeigen */}
      {newKey && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-green-600 font-medium text-sm">✅ Lizenz erfolgreich erstellt!</span>
          </div>
          <p className="text-xs text-gray-500">Kopiere den License Key — er wird nur einmal vollständig angezeigt:</p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 text-xs bg-white border border-green-200 rounded-lg p-2 break-all font-mono text-gray-700">
              {newKey}
            </code>
            <button
              onClick={() => copyKey(newKey)}
              className="text-xs px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors shrink-0"
            >
              Kopieren
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="text-xs text-gray-400 hover:text-gray-600">
            Schließen
          </button>
        </div>
      )}

      {/* Lizenz erstellen — Formular */}
      {showCreate && (
        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
          <h4 className="font-medium text-sm text-gray-700">Neue Lizenz ausstellen</h4>
          <form onSubmit={createLicense} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Kunden-ID *</label>
                <input
                  type="text"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="input-field text-sm w-full"
                  placeholder="z.B. client-001"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Kundenname *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="input-field text-sm w-full"
                  placeholder="z.B. Muster GmbH"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Plan *</label>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as "starter" | "business" | "enterprise")}
                  className="input-field text-sm w-full"
                >
                  <option value="starter">Starter</option>
                  <option value="business">Business</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Max. User</label>
                <input
                  type="number"
                  value={maxUsers}
                  onChange={(e) => setMaxUsers(parseInt(e.target.value) || 1)}
                  className="input-field text-sm w-full"
                  min={1}
                  max={9999}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Laufzeit (Monate)</label>
                <input
                  type="number"
                  value={months}
                  onChange={(e) => setMonths(parseInt(e.target.value) || 1)}
                  className="input-field text-sm w-full"
                  min={1}
                  max={120}
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Features (komma-getrennt)</label>
              <input
                type="text"
                value={featuresInput}
                onChange={(e) => setFeaturesInput(e.target.value)}
                className="input-field text-sm w-full"
                placeholder="chat,automation,admin"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Notizen (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input-field text-sm w-full"
                placeholder="Interne Notiz..."
              />
            </div>

            {createError && (
              <p className="text-xs text-red-500">{createError}</p>
            )}

            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary text-sm">
                {saving ? "Erstelle..." : "Lizenz erstellen"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lizenzen-Tabelle */}
      {licenses.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm bg-gray-50 rounded-xl border border-gray-100">
          Noch keine Lizenzen ausgestellt.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3">Kunde</th>
                <th className="text-left px-4 py-3">Plan</th>
                <th className="text-left px-4 py-3">Läuft ab</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Key</th>
                <th className="text-right px-4 py-3">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {licenses.map((lic) => {
                const daysLeft = getDaysRemaining(lic.expires_at);
                const isExpired = daysLeft === 0;
                return (
                  <tr key={lic.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{lic.customer_name}</div>
                      <div className="text-xs text-gray-400">{lic.customer_id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full w-fit ${PLAN_COLORS[lic.plan]}`}>
                          {lic.plan.charAt(0).toUpperCase() + lic.plan.slice(1)}
                        </span>
                        <span className="text-xs text-gray-400">{lic.max_users} User</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`text-sm ${isExpired ? "text-red-600 font-medium" : daysLeft <= 30 ? "text-amber-600" : "text-gray-600"}`}>
                        {lic.expires_at}
                      </div>
                      <div className={`text-xs ${isExpired ? "text-red-400" : daysLeft <= 30 ? "text-amber-400" : "text-gray-400"}`}>
                        {isExpired ? "Abgelaufen" : `${daysLeft} Tage`}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
                        !lic.is_active
                          ? "bg-red-100 text-red-700"
                          : isExpired
                            ? "bg-gray-100 text-gray-500"
                            : "bg-green-100 text-green-700"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${!lic.is_active ? "bg-red-500" : isExpired ? "bg-gray-400" : "bg-green-500"}`} />
                        {!lic.is_active ? "Widerrufen" : isExpired ? "Abgelaufen" : "Aktiv"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => copyKey(lic.license_key)}
                        className="text-xs text-gray-400 hover:text-primary-600 font-mono"
                        title="Key kopieren"
                      >
                        {lic.license_key.slice(0, 20)}...
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleActive(lic.id, lic.is_active)}
                        disabled={revoking === lic.id}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                          lic.is_active
                            ? "border-red-200 text-red-600 hover:bg-red-50"
                            : "border-green-200 text-green-600 hover:bg-green-50"
                        }`}
                      >
                        {revoking === lic.id ? "..." : lic.is_active ? "Widerrufen" : "Reaktivieren"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

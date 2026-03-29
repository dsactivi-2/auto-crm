"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function CredentialsForm({ userId }: { userId: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [crmUrl, setCrmUrl] = useState("https://crm.job-step.com");
  const [hasCredentials, setHasCredentials] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = createClient();

  useEffect(() => {
    loadCredentials();
  }, []);

  async function loadCredentials() {
    const { data } = await supabase
      .from("crm_credentials")
      .select("crm_username, crm_url, is_valid")
      .eq("user_id", userId)
      .single();

    if (data) {
      setUsername(data.crm_username);
      setCrmUrl(data.crm_url);
      setIsValid(data.is_valid);
      setHasCredentials(true);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, crmUrl }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage("Zugangsdaten gespeichert");
      setHasCredentials(true);
      setIsValid(null);
      setPassword("");
    } catch (err: unknown) {
      setMessage(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-semibold text-sm text-gray-700">CRM-Zugangsdaten</h3>
        {hasCredentials && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            isValid === true ? "bg-green-100 text-green-700" :
            isValid === false ? "bg-red-100 text-red-700" :
            "bg-gray-100 text-gray-500"
          }`}>
            {isValid === true ? "Verbunden" : isValid === false ? "Ungültig" : "Nicht geprüft"}
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="input-field text-sm"
          placeholder="CRM-Benutzername"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field text-sm"
          placeholder={hasCredentials ? "Neues Passwort (leer = unverändert)" : "CRM-Passwort"}
          required={!hasCredentials}
        />
        <input
          type="url"
          value={crmUrl}
          onChange={(e) => setCrmUrl(e.target.value)}
          className="input-field text-sm"
          placeholder="CRM-URL"
        />

        {message && (
          <p className={`text-xs ${message.startsWith("Fehler") ? "text-red-500" : "text-green-600"}`}>
            {message}
          </p>
        )}

        <button type="submit" className="btn-primary text-sm w-full" disabled={saving}>
          {saving ? "Speichern..." : "Zugangsdaten speichern"}
        </button>
      </form>
    </div>
  );
}

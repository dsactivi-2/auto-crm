"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";

const DEFAULT_CRM_URL = "https://crm.job-step.com";

const AVAILABLE_MODELS = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", desc: "Schnell & günstig — ideal für CRM-Aufgaben" },
  { id: "claude-opus-4-20250514", name: "Claude Opus 4", desc: "Stärkstes Modell — komplexe Analysen" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", desc: "Sehr schnell & am günstigsten" },
];

export default function CredentialsForm({ userId }: { userId: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [crmUrl, setCrmUrl] = useState(DEFAULT_CRM_URL);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [preferredModel, setPreferredModel] = useState("claude-haiku-4-5-20251001");
  const [hasCredentials, setHasCredentials] = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    loadCredentials(cancelled);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function loadCredentials(cancelled = false) {
    const { data } = await supabase
      .from("crm_credentials")
      .select("crm_username, crm_url, is_valid, anthropic_api_key_encrypted, preferred_model")
      .eq("user_id", userId)
      .single();

    if (data && !cancelled) {
      setUsername(data.crm_username);
      setCrmUrl(data.crm_url);
      setIsValid(data.is_valid);
      setHasCredentials(true);
      setHasAnthropicKey(!!data.anthropic_api_key_encrypted);
      if (data.preferred_model) setPreferredModel(data.preferred_model);
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
        body: JSON.stringify({
          username,
          password,
          crmUrl,
          anthropicApiKey: anthropicKey || undefined,
          preferredModel,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage("Zugangsdaten gespeichert");
      setHasCredentials(true);
      setIsValid(null);
      setPassword("");
      if (anthropicKey) {
        setHasAnthropicKey(true);
        setAnthropicKey("");
      }
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

        {/* KI-Einstellungen */}
        <div className="pt-3 border-t border-gray-200 space-y-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">KI-Einstellungen</h4>

          {/* Anthropic API Key */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label htmlFor="anthropic-key" className="text-xs font-medium text-gray-600">Anthropic API Key</label>
              {hasAnthropicKey && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  Gespeichert
                </span>
              )}
            </div>
            <input
              id="anthropic-key"
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              className="input-field text-sm"
              placeholder={hasAnthropicKey ? "Neuer Key (leer = unverändert)" : "sk-ant-..."}
            />
            <p className="text-xs text-gray-400 mt-1">
              Dein persönlicher API Key von{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="underline text-blue-400 hover:text-blue-600">
                console.anthropic.com
              </a>
            </p>
          </div>

          {/* Modell-Auswahl */}
          <div>
            <label htmlFor="preferred-model" className="text-xs font-medium text-gray-600 block mb-1">KI-Modell</label>
            <select
              id="preferred-model"
              value={preferredModel}
              onChange={(e) => setPreferredModel(e.target.value)}
              className="input-field text-sm w-full"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {AVAILABLE_MODELS.find((m) => m.id === preferredModel)?.desc}
            </p>
          </div>
        </div>

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

"use client";

import { useState } from "react";

interface ModuleResult {
  path: string;
  title?: string;
  text_preview?: string;
  accessible: boolean;
  error?: string;
}

interface CrawlResult {
  success: boolean;
  scanned_at: string;
  base_url: string;
  modules_found: number;
  modules: Record<string, ModuleResult>;
  errors: Array<{ module: string; error: string }>;
  duration_ms: number;
  error?: string;
}

export default function CrawlerPanel() {
  const [result, setResult] = useState<CrawlResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "accessible" | "errors">("all");
  const [search, setSearch] = useState("");

  async function startCrawl() {
    setRunning(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/crawl", { method: "POST" });
      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error || "Crawl fehlgeschlagen");
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setRunning(false);
    }
  }

  const filteredModules = result
    ? Object.entries(result.modules).filter(([name, mod]) => {
        const matchesFilter =
          filter === "all" ||
          (filter === "accessible" && mod.accessible) ||
          (filter === "errors" && !mod.accessible);
        const matchesSearch =
          !search ||
          name.toLowerCase().includes(search.toLowerCase()) ||
          (mod.title || "").toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
      })
    : [];

  const accessibleCount = result
    ? Object.values(result.modules).filter((m) => m.accessible).length
    : 0;
  const errorCount = result
    ? Object.values(result.modules).filter((m) => !m.accessible).length
    : 0;

  return (
    <div className="space-y-4">
      {/* Info-Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-800 text-sm mb-1">CRM-Struktur Scanner</h3>
        <p className="text-xs text-blue-600">
          Scannt alle bekannten CRM-Module und prüft deren Erreichbarkeit. Benötigt aktiven CRM-Login.
          Dauer ca. 1–3 Minuten.
        </p>
      </div>

      {/* Start Button */}
      <button
        onClick={startCrawl}
        disabled={running}
        className="w-full btn-primary py-3 text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {running ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Scannt CRM-Module... (bitte warten)
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            CRM-Struktur jetzt scannen
          </>
        )}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          ❌ {error}
        </div>
      )}

      {/* Ergebnis */}
      {result && (
        <div className="space-y-3">
          {/* Zusammenfassung */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
              <div className="text-2xl font-bold text-gray-800">{result.modules_found}</div>
              <div className="text-xs text-gray-400 mt-0.5">Module gesamt</div>
            </div>
            <div className="bg-green-50 rounded-lg border border-green-100 p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{accessibleCount}</div>
              <div className="text-xs text-green-500 mt-0.5">Erreichbar</div>
            </div>
            <div className={`rounded-lg border p-3 text-center ${errorCount > 0 ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"}`}>
              <div className={`text-2xl font-bold ${errorCount > 0 ? "text-red-700" : "text-gray-400"}`}>{errorCount}</div>
              <div className={`text-xs mt-0.5 ${errorCount > 0 ? "text-red-500" : "text-gray-400"}`}>Fehler</div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Gescannt: {new Date(result.scanned_at).toLocaleString("de-DE")}</span>
            <span>{(result.duration_ms / 1000).toFixed(1)}s</span>
          </div>

          {/* Filter + Suche */}
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field text-xs flex-1"
              placeholder="Modul suchen..."
            />
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {(["all", "accessible", "errors"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    filter === f ? "bg-white text-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {f === "all" ? "Alle" : f === "accessible" ? "OK" : "Fehler"}
                </button>
              ))}
            </div>
          </div>

          {/* Module-Liste */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredModules.map(([name, mod]) => (
              <div
                key={name}
                className={`rounded-lg border p-3 ${
                  mod.accessible
                    ? "border-gray-100 bg-white"
                    : "border-red-100 bg-red-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${mod.accessible ? "bg-green-400" : "bg-red-400"}`} />
                      <span className="text-sm font-medium text-gray-700">{name}</span>
                    </div>
                    <div className="text-xs text-gray-400 ml-4 mt-0.5">{mod.path}</div>
                    {mod.title && (
                      <div className="text-xs text-gray-500 ml-4 mt-0.5 italic">{mod.title}</div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    mod.accessible ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                  }`}>
                    {mod.accessible ? "OK" : "Fehler"}
                  </span>
                </div>
                {mod.error && (
                  <div className="text-xs text-red-500 mt-1 ml-4">{mod.error}</div>
                )}
              </div>
            ))}
            {filteredModules.length === 0 && (
              <div className="text-center py-6 text-sm text-gray-400">Keine Module gefunden</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

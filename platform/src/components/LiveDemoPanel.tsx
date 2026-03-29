"use client";

import { useEffect, useRef, useState } from "react";

interface Job {
  id: string;
  action: string;
  module: string;
  details: Record<string, unknown>;
  status: "success" | "error" | "pending";
  error_message?: string;
  duration_ms?: number;
  created_at: string;
}

interface LiveData {
  jobs: Job[];
  fetched_at: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  success: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-400" },
  error:   { bg: "bg-red-50",   text: "text-red-700",   dot: "bg-red-400"   },
  pending: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" },
};

const MODULE_ICONS: Record<string, string> = {
  System:       "⚙️",
  Kandidaten:   "👤",
  Sales:        "📈",
  Tasks:        "✅",
  Nachrichten:  "💬",
  Companies:    "🏢",
  Aufträge:     "📋",
  Finanzen:     "💰",
  Mitarbeiter:  "👥",
  Kampagnen:    "📣",
};

function getModuleIcon(module: string): string {
  for (const [key, icon] of Object.entries(MODULE_ICONS)) {
    if (module.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return "🔧";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `vor ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `vor ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h}h`;
  return new Date(dateStr).toLocaleDateString("de-DE");
}

export default function LiveDemoPanel() {
  const [data, setData] = useState<LiveData | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loadingScreenshot, setLoadingScreenshot] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  async function fetchJobs() {
    try {
      const res = await fetch("/api/live-jobs");
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
      setLastUpdate(new Date().toLocaleTimeString("de-DE"));
    } catch {
      // ignore
    }
  }

  async function takeScreenshot() {
    setLoadingScreenshot(true);
    try {
      const res = await fetch("/api/screenshot", { method: "POST" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.screenshot) setScreenshot(json.screenshot);
    } catch {
      // ignore
    } finally {
      setLoadingScreenshot(false);
    }
  }

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchJobs, 5000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh]);

  const jobs = data?.jobs || [];
  const recentJobs = jobs.slice(0, 10);
  const pendingJobs = jobs.filter((j) => j.status === "pending");
  const successCount = jobs.filter((j) => j.status === "success").length;
  const errorCount = jobs.filter((j) => j.status === "error").length;

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800 text-sm">Live Job Monitor</h3>
          {lastUpdate && (
            <p className="text-xs text-gray-400 mt-0.5">Zuletzt aktualisiert: {lastUpdate}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              autoRefresh
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            {autoRefresh ? "Live" : "Pause"}
          </button>
          <button
            onClick={fetchJobs}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ↻ Reload
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
          <div className="text-xl font-bold text-gray-700">{jobs.length}</div>
          <div className="text-xs text-gray-400 mt-0.5">Jobs (letzte)</div>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-100 p-3 text-center">
          <div className="text-xl font-bold text-green-700">{successCount}</div>
          <div className="text-xs text-green-500 mt-0.5">Erfolgreich</div>
        </div>
        <div className={`rounded-lg border p-3 text-center ${errorCount > 0 ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"}`}>
          <div className={`text-xl font-bold ${errorCount > 0 ? "text-red-700" : "text-gray-400"}`}>{errorCount}</div>
          <div className={`text-xs mt-0.5 ${errorCount > 0 ? "text-red-500" : "text-gray-400"}`}>Fehler</div>
        </div>
      </div>

      {/* Aktive Jobs (pending) */}
      {pendingJobs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-amber-800">{pendingJobs.length} Job(s) aktiv</span>
          </div>
          <div className="space-y-2">
            {pendingJobs.map((job) => (
              <div key={job.id} className="flex items-center gap-3 bg-white rounded-lg p-2.5 border border-amber-100">
                <span className="text-lg">{getModuleIcon(job.module)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-700 truncate">{job.action}</div>
                  <div className="text-xs text-gray-400">{job.module}</div>
                </div>
                <div className="shrink-0">
                  <svg className="animate-spin w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Screenshot */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600">Browser-Screenshot</span>
          <button
            onClick={takeScreenshot}
            disabled={loadingScreenshot}
            className="text-xs px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loadingScreenshot ? "Lädt..." : "Screenshot"}
          </button>
        </div>
        {screenshot ? (
          <img
            src={`data:image/png;base64,${screenshot}`}
            alt="CRM Browser Screenshot"
            className="w-full rounded-lg border border-gray-100"
          />
        ) : (
          <div className="text-center py-8 text-xs text-gray-400">
            Klicke &quot;Screenshot&quot; um den aktuellen CRM-Browserstatus zu sehen.
          </div>
        )}
      </div>

      {/* Job-Timeline */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Letzte Aktivitäten
        </h4>
        {recentJobs.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
            Noch keine Aktivitäten. Starte eine CRM-Aktion über den Chat.
          </div>
        ) : (
          <div className="space-y-2">
            {recentJobs.map((job) => {
              const colors = STATUS_COLORS[job.status] || STATUS_COLORS.pending;
              return (
                <div
                  key={job.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${colors.bg}`}
                >
                  <span className="text-base mt-0.5">{getModuleIcon(job.module)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-700 truncate">{job.action}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} border border-current border-opacity-20 shrink-0`}>
                        {job.status === "success" ? "✓" : job.status === "error" ? "✗" : "..."}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-400">{job.module}</span>
                      {job.duration_ms && (
                        <span className="text-xs text-gray-300">{job.duration_ms}ms</span>
                      )}
                      <span className="text-xs text-gray-300 ml-auto">{timeAgo(job.created_at)}</span>
                    </div>
                    {job.error_message && (
                      <div className="text-xs text-red-500 mt-1">{job.error_message}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

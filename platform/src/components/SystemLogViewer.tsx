"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

interface SystemLog {
  id: string;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  source: string;
  message: string;
  user_id: string | null;
  metadata: Record<string, unknown>;
  resolved: boolean;
  created_at: string;
}

type FilterLevel = "all" | "warn" | "error" | "fatal";

export default function SystemLogViewer() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<FilterLevel>("all");
  const [filterSource, setFilterSource] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    loadLogs();

    // Realtime für neue Logs
    const channel = supabase
      .channel("system_logs")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "system_logs",
      }, (payload) => {
        setLogs((prev) => [payload.new as SystemLog, ...prev]);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [filterLevel, filterSource, showResolved]);

  async function loadLogs() {
    setLoading(true);
    let query = supabase
      .from("system_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (filterLevel !== "all") {
      if (filterLevel === "error") {
        query = query.in("level", ["error", "fatal"]);
      } else {
        query = query.eq("level", filterLevel);
      }
    }

    if (filterSource) {
      query = query.ilike("source", `%${filterSource}%`);
    }

    if (!showResolved) {
      query = query.eq("resolved", false);
    }

    const { data } = await query;
    setLogs(data || []);
    setLoading(false);
  }

  async function toggleResolved(logId: string, currentResolved: boolean) {
    await supabase
      .from("system_logs")
      .update({ resolved: !currentResolved })
      .eq("id", logId);

    setLogs((prev) =>
      prev.map((l) => l.id === logId ? { ...l, resolved: !currentResolved } : l)
    );
  }

  const levelStyle: Record<string, string> = {
    debug: "bg-gray-100 text-gray-600",
    info: "bg-blue-100 text-blue-700",
    warn: "bg-yellow-100 text-yellow-800",
    error: "bg-red-100 text-red-700",
    fatal: "bg-red-200 text-red-900 font-bold",
  };

  const levelIcon: Record<string, string> = {
    debug: "🔍",
    info: "ℹ️",
    warn: "⚠️",
    error: "❌",
    fatal: "💀",
  };

  const unresolvedCount = logs.filter((l) => !l.resolved && (l.level === "error" || l.level === "fatal")).length;

  return (
    <div className="space-y-4">
      {/* Header mit Zähler */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-800">System-Logs</h3>
          {unresolvedCount > 0 && (
            <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full font-medium">
              {unresolvedCount} offen
            </span>
          )}
        </div>
        <button
          onClick={loadLogs}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          Aktualisieren
        </button>
      </div>

      {/* Filter-Leiste */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 font-medium">Level:</label>
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as FilterLevel)}
            className="text-sm border border-gray-200 rounded px-2 py-1 bg-white"
          >
            <option value="all">Alle</option>
            <option value="warn">Warn</option>
            <option value="error">Error + Fatal</option>
            <option value="fatal">Nur Fatal</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 font-medium">Source:</label>
          <input
            type="text"
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadLogs()}
            placeholder="z.B. api/chat"
            className="text-sm border border-gray-200 rounded px-2 py-1 w-36 bg-white"
          />
        </div>

        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="rounded border-gray-300"
          />
          Gelöste zeigen
        </label>
      </div>

      {/* Log-Liste */}
      {loading ? (
        <div className="text-gray-400 text-sm p-4 text-center">Lade Logs...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">Keine Logs gefunden</p>
          <p className="text-xs mt-1">Nur warn/error/fatal werden in der DB gespeichert</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {logs.map((entry) => (
            <div
              key={entry.id}
              className={`rounded-lg border transition-colors ${
                entry.resolved ? "border-gray-100 bg-gray-50 opacity-60" : "border-gray-200 bg-white"
              } ${expandedId === entry.id ? "ring-1 ring-primary-200" : ""}`}
            >
              {/* Log-Zeile */}
              <div
                className="flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              >
                <span className={`text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap ${levelStyle[entry.level]}`}>
                  {levelIcon[entry.level]} {entry.level.toUpperCase()}
                </span>

                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-mono whitespace-nowrap">
                  {entry.source}
                </span>

                <p className="flex-1 text-sm text-gray-700 truncate">{entry.message}</p>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400">
                    {new Date(entry.created_at).toLocaleString("de-DE", {
                      day: "2-digit", month: "2-digit",
                      hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleResolved(entry.id, entry.resolved); }}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${
                      entry.resolved
                        ? "bg-green-100 text-green-600 hover:bg-green-200"
                        : "bg-gray-100 text-gray-500 hover:bg-yellow-100 hover:text-yellow-700"
                    }`}
                    title={entry.resolved ? "Als ungelöst markieren" : "Als gelöst markieren"}
                  >
                    {entry.resolved ? "✓ Gelöst" : "Lösen"}
                  </button>
                </div>
              </div>

              {/* Expandierte Details */}
              {expandedId === entry.id && (
                <div className="px-3 pb-3 border-t border-gray-100">
                  <div className="mt-2 space-y-2">
                    {entry.user_id && (
                      <div className="text-xs">
                        <span className="text-gray-500 font-medium">User-ID: </span>
                        <span className="font-mono text-gray-600">{entry.user_id}</span>
                      </div>
                    )}
                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <div>
                        <span className="text-xs text-gray-500 font-medium">Metadata:</span>
                        <pre className="mt-1 p-2 bg-gray-900 text-green-400 text-xs rounded font-mono overflow-x-auto max-h-48 overflow-y-auto">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                    <div className="text-xs text-gray-400">
                      Erstellt: {new Date(entry.created_at).toLocaleString("de-DE")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

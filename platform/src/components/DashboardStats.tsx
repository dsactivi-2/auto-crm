"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

interface Stats {
  today: number;
  week: number;
  total: number;
  byModule: Record<string, number>;
  byStatus: { success: number; error: number; pending: number };
  hourly: { hour: string; count: number }[];
}

interface DashboardStatsProps {
  userId?: string; // optional: leer = alle (Admin)
}

export default function DashboardStats({ userId }: DashboardStatsProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function loadStats() {
    try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let baseQuery = supabase.from("activities").select("*");
    if (userId) baseQuery = baseQuery.eq("user_id", userId);

    const { data: allActivities } = await baseQuery.order("created_at", { ascending: false }).limit(500);
    const activities = allActivities || [];

    const todayActivities = activities.filter((a) => a.created_at >= todayStart);
    const weekActivities = activities.filter((a) => a.created_at >= weekStart);

    // Nach Modul gruppieren
    const byModule: Record<string, number> = {};
    activities.forEach((a) => {
      byModule[a.module] = (byModule[a.module] || 0) + 1;
    });

    // Nach Status
    const byStatus = { success: 0, error: 0, pending: 0 };
    activities.forEach((a) => {
      if (a.status in byStatus) byStatus[a.status as keyof typeof byStatus]++;
    });

    // Stündlich (letzte 24h)
    const hourly: { hour: string; count: number }[] = [];
    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
      const count = activities.filter(
        (a) => new Date(a.created_at) >= hourStart && new Date(a.created_at) < hourEnd
      ).length;
      hourly.push({
        hour: hourStart.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
        count,
      });
    }

    setStats({
      today: todayActivities.length,
      week: weekActivities.length,
      total: activities.length,
      byModule,
      byStatus,
      hourly,
    });
    } catch {
      setError(true);
    }
  }

  if (error) return <div className="text-red-400 text-sm">Statistiken konnten nicht geladen werden.</div>;
  if (!stats) return <div className="text-gray-400 text-sm">Lade Statistiken...</div>;

  const topModules = Object.entries(stats.byModule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const maxModuleCount = Math.max(...topModules.map(([, c]) => c), 1);
  const maxHourly = Math.max(...stats.hourly.map((h) => h.count), 1);

  const moduleColors = [
    "bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-orange-500",
    "bg-pink-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500",
  ];

  return (
    <div className="space-y-4">
      {/* KPI-Karten */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Heute</p>
          <p className="text-2xl font-bold text-primary-700 mt-1">{stats.today}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Diese Woche</p>
          <p className="text-2xl font-bold text-primary-700 mt-1">{stats.week}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Gesamt</p>
          <p className="text-2xl font-bold text-primary-700 mt-1">{stats.total}</p>
        </div>
      </div>

      {/* Status-Übersicht */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Status</p>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-400" />
            <span className="text-sm">{stats.byStatus.success} Erfolgreich</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <span className="text-sm">{stats.byStatus.error} Fehler</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <span className="text-sm">{stats.byStatus.pending} Ausstehend</span>
          </div>
        </div>
        {/* Status-Bar */}
        <div className="flex h-2 rounded-full overflow-hidden mt-2 bg-gray-100">
          {stats.total > 0 && (
            <>
              <div className="bg-green-400" style={{ width: `${(stats.byStatus.success / stats.total) * 100}%` }} />
              <div className="bg-red-400" style={{ width: `${(stats.byStatus.error / stats.total) * 100}%` }} />
              <div className="bg-yellow-400" style={{ width: `${(stats.byStatus.pending / stats.total) * 100}%` }} />
            </>
          )}
        </div>
      </div>

      {/* Aktivität pro Stunde (Mini-Chart) */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Aktivität (24h)</p>
        <div className="flex items-end gap-px h-16">
          {stats.hourly.map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center group relative">
              <div
                className="w-full bg-primary-400 rounded-t-sm transition-all hover:bg-primary-600 min-h-[2px]"
                style={{ height: `${Math.max((h.count / maxHourly) * 100, 3)}%` }}
              />
              <div className="hidden group-hover:block absolute -top-8 bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                {h.hour}: {h.count}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-gray-400">{stats.hourly[0]?.hour}</span>
          <span className="text-[10px] text-gray-400">{stats.hourly[stats.hourly.length - 1]?.hour}</span>
        </div>
      </div>

      {/* Top-Module */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Top-Module</p>
        <div className="space-y-2">
          {topModules.map(([module, count], i) => (
            <div key={module} className="flex items-center gap-2">
              <span className="text-xs text-gray-600 w-24 truncate">{module}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full rounded-full ${moduleColors[i % moduleColors.length]} transition-all`}
                  style={{ width: `${(count / maxModuleCount) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-8 text-right">{count}</span>
            </div>
          ))}
          {topModules.length === 0 && (
            <p className="text-sm text-gray-400">Noch keine Daten</p>
          )}
        </div>
      </div>
    </div>
  );
}

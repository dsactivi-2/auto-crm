"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { Activity } from "@/lib/types";

interface ActivityLogProps {
  userId?: string; // Optional: wenn leer, zeigt alle (Admin)
  showUser?: boolean;
}

export default function ActivityLog({ userId, showUser = false }: ActivityLogProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadActivities();

    // Realtime-Subscription
    const channel = supabase
      .channel("activities")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "activities",
        ...(userId ? { filter: `user_id=eq.${userId}` } : {}),
      }, (payload) => {
        setActivities((prev) => [payload.new as Activity, ...prev]);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function loadActivities() {
    let query = supabase
      .from("activities")
      .select("*, profiles(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (userId) query = query.eq("user_id", userId);

    const { data } = await query;
    setActivities(data || []);
    setLoading(false);
  }

  const statusColor = {
    success: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
    pending: "bg-yellow-100 text-yellow-700",
  };

  const moduleColors: Record<string, string> = {
    Kandidaten: "bg-blue-100 text-blue-700",
    Sales: "bg-purple-100 text-purple-700",
    Finanzen: "bg-emerald-100 text-emerald-700",
    Tasks: "bg-orange-100 text-orange-700",
    Companies: "bg-pink-100 text-pink-700",
  };

  if (loading) return <div className="text-gray-400 text-sm p-4">Lade Aktivitäten...</div>;

  return (
    <div className="space-y-2">
      {activities.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">Noch keine Aktivitäten</p>
      ) : (
        activities.map((a) => (
          <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <div className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor[a.status]}`}>
              {a.status === "success" ? "OK" : a.status === "error" ? "ERR" : "..."}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${moduleColors[a.module] || "bg-gray-100 text-gray-600"}`}>
                  {a.module}
                </span>
                {showUser && a.profiles && (
                  <span className="text-xs text-gray-400">{a.profiles.full_name || a.profiles.email}</span>
                )}
              </div>
              <p className="text-sm text-gray-700 mt-0.5">{a.action}</p>
              {a.error_message && <p className="text-xs text-red-500 mt-0.5">{a.error_message}</p>}
            </div>
            <div className="text-xs text-gray-400 whitespace-nowrap">
              {new Date(a.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
              {a.duration_ms && <span className="ml-1">({a.duration_ms}ms)</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

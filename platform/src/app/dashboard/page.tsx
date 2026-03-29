"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import Navbar from "@/components/Navbar";
import Chat from "@/components/Chat";
import ActivityLog from "@/components/ActivityLog";
import CredentialsForm from "@/components/CredentialsForm";
import DashboardStats from "@/components/DashboardStats";
import type { Profile, ChatMessage } from "@/lib/types";

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"chat" | "stats">("chat");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (profileData) setProfile(profileData);

      const { data: messages } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true })
        .limit(100);

      if (messages) setChatMessages(messages);
      setLoading(false);
    }

    init();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary-600">Laden...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar profile={profile} />

      <div className="flex-1 flex max-w-7xl mx-auto w-full gap-4 p-4">
        {/* Linke Spalte: Chat oder Stats */}
        <div className="flex-1 card flex flex-col min-h-[calc(100vh-8rem)]">
          {/* Tabs */}
          <div className="flex items-center gap-1 mb-2 pb-2 border-b border-gray-100">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "chat" ? "bg-primary-50 text-primary-700" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              CRM-Assistent
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "stats" ? "bg-primary-50 text-primary-700" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Statistiken
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === "chat" && profile && (
              <Chat userId={profile.id} initialMessages={chatMessages} />
            )}
            {activeTab === "stats" && profile && (
              <div className="p-2">
                <DashboardStats userId={profile.id} />
              </div>
            )}
          </div>
        </div>

        {/* Rechte Spalte: Credentials + Activity */}
        <div className="w-80 flex flex-col gap-4">
          {/* CRM-Zugangsdaten */}
          <div className="card">
            {profile && <CredentialsForm userId={profile.id} />}
          </div>

          {/* Aktivitäten */}
          <div className="card flex-1 flex flex-col min-h-0">
            <h3 className="font-semibold text-sm text-gray-700 mb-3">Meine Aktivitäten</h3>
            <div className="flex-1 overflow-y-auto">
              {profile && <ActivityLog userId={profile.id} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

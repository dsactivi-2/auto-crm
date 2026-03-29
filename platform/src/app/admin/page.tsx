"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import Navbar from "@/components/Navbar";
import ActivityLog from "@/components/ActivityLog";
import DashboardStats from "@/components/DashboardStats";
import SystemLogViewer from "@/components/SystemLogViewer";
import LicenseManager from "@/components/LicenseManager";
import LicenseAdminManager from "@/components/LicenseAdminManager";
import type { Profile } from "@/lib/types";

export default function AdminPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [filterUser, setFilterUser] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [activeTab, setActiveTab] = useState<"activities" | "logs" | "license" | "licenses">("activities");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"user" | "admin">("user");
  const [createMsg, setCreateMsg] = useState("");
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

      if (!profileData || profileData.role !== "admin") {
        router.push("/dashboard");
        return;
      }

      setProfile(profileData);

      const { data: usersData } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (usersData) setUsers(usersData);
      setLoading(false);
    }

    init();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateMsg("");

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          fullName: newUserName,
          role: newUserRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCreateMsg("User erstellt!");
      setNewUserEmail("");
      setNewUserName("");
      setNewUserPassword("");
      setShowCreateUser(false);

      // Refresh user list
      const { data: usersData } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (usersData) setUsers(usersData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setCreateMsg(`Fehler: ${message}`);
    }
  }

  async function toggleUserActive(userId: string, currentActive: boolean) {
    await supabase
      .from("profiles")
      .update({ is_active: !currentActive })
      .eq("id", userId);

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, is_active: !currentActive } : u))
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary-600">Laden...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar profile={profile} />

      <div className="max-w-7xl mx-auto w-full p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">Admin-Dashboard</h2>
          <button onClick={() => setShowCreateUser(!showCreateUser)} className="btn-primary text-sm">
            + Neuer User
          </button>
        </div>

        {/* Create User Form */}
        {showCreateUser && (
          <div className="card">
            <h3 className="font-semibold mb-3">Neuen User erstellen</h3>
            <form onSubmit={createUser} className="grid grid-cols-2 gap-3">
              <input
                type="text" value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                className="input-field text-sm" placeholder="Name" required
              />
              <input
                type="email" value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className="input-field text-sm" placeholder="E-Mail" required
              />
              <input
                type="password" value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                className="input-field text-sm" placeholder="Passwort" minLength={6} required
              />
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as "user" | "admin")}
                className="input-field text-sm"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <div className="col-span-2 flex gap-2">
                <button type="submit" className="btn-primary text-sm">Erstellen</button>
                <button type="button" onClick={() => setShowCreateUser(false)} className="btn-secondary text-sm">
                  Abbrechen
                </button>
                {createMsg && <span className="text-sm self-center text-gray-500">{createMsg}</span>}
              </div>
            </form>
          </div>
        )}

        {/* Gesamtstatistiken */}
        <DashboardStats userId={filterUser || undefined} />

        {/* Tab-Navigation */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("activities")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "activities"
                ? "bg-white text-primary-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Aktivitäten
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "logs"
                ? "bg-white text-primary-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            System-Logs
          </button>
          <button
            onClick={() => setActiveTab("license")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "license"
                ? "bg-white text-primary-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            App-Lizenz
          </button>
          <button
            onClick={() => setActiveTab("licenses")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "licenses"
                ? "bg-white text-primary-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Kundenliz.
          </button>
        </div>

        {activeTab === "activities" ? (
          <div className="grid grid-cols-3 gap-4">
            {/* User-Liste */}
            <div className="col-span-1 card">
              <h3 className="font-semibold text-sm text-gray-700 mb-3">
                User ({users.length})
              </h3>
              <div className="space-y-2">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      filterUser === u.id
                        ? "border-primary-400 bg-primary-50"
                        : "border-gray-100 hover:bg-gray-50"
                    }`}
                    onClick={() => setFilterUser(filterUser === u.id ? "" : u.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{u.full_name || u.email}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          u.role === "admin" ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {u.role}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleUserActive(u.id, u.is_active); }}
                          className={`w-2 h-2 rounded-full ${u.is_active ? "bg-green-400" : "bg-red-400"}`}
                          title={u.is_active ? "Aktiv — klicken zum Deaktivieren" : "Inaktiv — klicken zum Aktivieren"}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity Log (alle oder gefiltert) */}
            <div className="col-span-2 card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-gray-700">
                  {filterUser
                    ? `Aktivitäten: ${users.find((u) => u.id === filterUser)?.full_name || "User"}`
                    : "Alle Aktivitäten"}
                </h3>
                {filterUser && (
                  <button onClick={() => setFilterUser("")} className="text-xs text-primary-600 hover:underline">
                    Filter aufheben
                  </button>
                )}
              </div>
              <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
                <ActivityLog userId={filterUser || undefined} showUser={!filterUser} />
              </div>
            </div>
          </div>
        ) : activeTab === "logs" ? (
          <div className="card">
            <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
              <SystemLogViewer />
            </div>
          </div>
        ) : activeTab === "license" ? (
          <div className="max-w-xl">
            <LicenseManager />
          </div>
        ) : (
          <div className="card">
            <LicenseAdminManager />
          </div>
        )}
      </div>
    </div>
  );
}

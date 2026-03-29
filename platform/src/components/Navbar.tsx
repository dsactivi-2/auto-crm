"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import type { Profile } from "@/lib/types";

export default function Navbar({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-primary-700">CRM Platform</h1>
          <div className="flex gap-1">
            <a href="/dashboard" className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100">
              Dashboard
            </a>
            {profile?.role === "admin" && (
              <a href="/admin" className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100">
                Admin
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            {profile?.full_name || profile?.email}
            {profile?.role === "admin" && (
              <span className="ml-2 bg-primary-100 text-primary-700 text-xs px-2 py-0.5 rounded-full">Admin</span>
            )}
          </div>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-gray-600">
            Abmelden
          </button>
        </div>
      </div>
    </nav>
  );
}

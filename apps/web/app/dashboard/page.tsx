"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Zap } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getApps, githubInstallUrl } from "../../lib/api";
import { AppCard } from "../../components/AppCard";
import type { SpawnApp } from "@spawn/shared";

export default function DashboardPage() {
  const router = useRouter();
  const [apps, setApps] = useState<SpawnApp[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setUserId(data.session.user.id);
      getApps().then((a) => { setApps(a); setLoading(false); });
    });

    // Poll every 5s to update statuses
    const interval = setInterval(() => {
      getApps().then(setApps).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg">spawn</span>
          <span className="w-2 h-2 rounded-full bg-green-500" />
        </div>
        <div className="flex items-center gap-4">
          {userId && (
            <a
              href={githubInstallUrl(userId)}
              className="text-sm text-[#888] hover:text-white transition"
            >
              + Connect repo
            </a>
          )}
          <button
            onClick={signOut}
            className="text-sm text-[#555] hover:text-white transition"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Your Apps</h1>
            <p className="text-[#555] text-sm mt-1">
              {apps.length} app{apps.length !== 1 ? "s" : ""} deployed
            </p>
          </div>
          <button
            onClick={() => router.push("/deploy")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-100 transition"
          >
            <Plus className="w-4 h-4" />
            Deploy app
          </button>
        </div>

        {loading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-[#111] animate-pulse" />
            ))}
          </div>
        ) : apps.length === 0 ? (
          <EmptyState onDeploy={() => router.push("/deploy")} />
        ) : (
          <div className="grid gap-4">
            {apps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState({ onDeploy }: { onDeploy: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-[#111] border border-[#222] flex items-center justify-center">
        <Zap className="w-6 h-6 text-[#555]" />
      </div>
      <h2 className="text-lg font-semibold">No apps yet</h2>
      <p className="text-[#555] text-sm max-w-xs">
        Connect a GitHub repo and Spawn will configure, deploy, and heal it automatically.
      </p>
      <button
        onClick={onDeploy}
        className="px-5 py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-100 transition"
      >
        Deploy your first app
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, ExternalLink, RefreshCw, Trash2,
  GitCommit, Zap, MemoryStick, Cpu
} from "lucide-react";
import { getApp, getDeployments, triggerDeploy, deleteApp } from "../../../lib/api";
import { StatusBadge } from "../../../components/StatusBadge";
import { LogViewer } from "../../../components/LogViewer";
import type { SpawnApp, Deployment } from "@spawn/shared";

export default function AppDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [app, setApp] = useState<SpawnApp | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [activeDeployId, setActiveDeployId] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    getApp(id).then(setApp);
    getDeployments(id).then(setDeployments);

    const interval = setInterval(() => {
      getApp(id).then(setApp);
    }, 5000);
    return () => clearInterval(interval);
  }, [id]);

  async function handleRedeploy() {
    setDeploying(true);
    const { deployment_id } = await triggerDeploy(id);
    setActiveDeployId(deployment_id);
    setDeploying(false);
    getDeployments(id).then(setDeployments);
  }

  async function handleDelete() {
    if (!confirm(`Delete ${app?.name}? This will destroy the Fly app.`)) return;
    await deleteApp(id);
    router.push("/dashboard");
  }

  if (!app) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-4xl mx-auto px-6 py-10">
      <button
        onClick={() => router.push("/dashboard")}
        className="flex items-center gap-2 text-[#555] hover:text-white text-sm mb-8 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">{app.name}</h1>
            <StatusBadge status={app.status} />
          </div>
          <p className="text-[#555] text-sm">{app.repo_full_name}</p>
          {app.url && (
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-green-400 hover:text-green-300 mt-1"
            >
              {app.url} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRedeploy}
            disabled={deploying}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#222] text-sm text-[#888] hover:text-white hover:border-[#333] transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${deploying ? "animate-spin" : ""}`} />
            Redeploy
          </button>
          <button
            onClick={handleDelete}
            className="p-2 rounded-lg border border-[#222] text-[#555] hover:text-red-400 hover:border-red-900 transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Resources */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard icon={<MemoryStick className="w-4 h-4" />} label="RAM" value={`${app.ram_mb} MB`} />
        <StatCard icon={<Cpu className="w-4 h-4" />} label="vCPU" value={String(app.cpu_count)} />
        <StatCard icon={<Zap className="w-4 h-4" />} label="Region" value={app.region.toUpperCase()} />
      </div>

      {/* Active deployment logs */}
      {activeDeployId && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[#888] uppercase tracking-wider mb-3">Live Deploy</h2>
          <LogViewer deploymentId={activeDeployId} onDone={() => getApp(id).then(setApp)} />
        </div>
      )}

      {/* Deployment history */}
      <div>
        <h2 className="text-sm font-semibold text-[#888] uppercase tracking-wider mb-3">Deploy History</h2>
        <div className="space-y-2">
          {deployments.length === 0 && (
            <p className="text-[#444] text-sm py-4">No deployments yet.</p>
          )}
          {deployments.map((d) => (
            <div
              key={d.id}
              onClick={() => setActiveDeployId(d.id)}
              className="flex items-center gap-3 p-4 rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] hover:border-[#222] cursor-pointer transition"
            >
              <GitCommit className="w-4 h-4 text-[#555] shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{d.commit_message || "Manual deploy"}</p>
                <p className="text-xs text-[#555] mono">{d.commit_sha?.slice(0, 7)}</p>
              </div>
              <span className={`text-xs font-medium shrink-0 ${
                d.status === "success" ? "text-green-400" :
                d.status === "failed" ? "text-red-400" :
                d.status === "running" ? "text-blue-400" : "text-[#555]"
              }`}>
                {d.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value
}: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-4 rounded-xl border border-[#1a1a1a] bg-[#0d0d0d]">
      <div className="flex items-center gap-2 text-[#555] mb-2">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

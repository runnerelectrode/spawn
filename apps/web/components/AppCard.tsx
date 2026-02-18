import type { SpawnApp } from "@spawn/shared";
import { StatusBadge } from "./StatusBadge";
import { ExternalLink, GitBranch, Cpu, MemoryStick } from "lucide-react";
import Link from "next/link";

export function AppCard({ app }: { app: SpawnApp }) {
  return (
    <Link
      href={`/apps/${app.id}`}
      className="block p-5 rounded-xl border border-[#222] bg-[#111] hover:border-[#333] hover:bg-[#151515] transition group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-white truncate">{app.name}</h3>
            <StatusBadge status={app.status} />
          </div>
          <div className="flex items-center gap-1 text-xs text-[#555]">
            <GitBranch className="w-3 h-3" />
            <span className="truncate">{app.repo_full_name}</span>
          </div>
        </div>

        {app.url && (
          <a
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 p-1.5 rounded-lg text-[#555] hover:text-white hover:bg-[#222] transition"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-[#555]">
        <span className="flex items-center gap-1">
          <MemoryStick className="w-3 h-3" />
          {app.ram_mb}MB
        </span>
        <span className="flex items-center gap-1">
          <Cpu className="w-3 h-3" />
          {app.cpu_count} vCPU
        </span>
        <span className="ml-auto capitalize text-[#444]">{app.framework}</span>
      </div>
    </Link>
  );
}

import type { AppStatus } from "@spawn/shared";
import clsx from "clsx";

const config: Record<AppStatus, { label: string; dot: string; text: string }> = {
  pending:    { label: "Pending",   dot: "bg-gray-500",   text: "text-gray-400" },
  analyzing:  { label: "Analyzing", dot: "bg-blue-400 animate-pulse", text: "text-blue-400" },
  building:   { label: "Building",  dot: "bg-yellow-400 animate-pulse", text: "text-yellow-400" },
  deploying:  { label: "Deploying", dot: "bg-yellow-400 animate-pulse", text: "text-yellow-400" },
  running:    { label: "Live",      dot: "bg-green-500",  text: "text-green-400" },
  crashed:    { label: "Crashed",   dot: "bg-red-500",    text: "text-red-400" },
  healing:    { label: "Healing",   dot: "bg-orange-400 animate-pulse", text: "text-orange-400" },
  stopped:    { label: "Stopped",   dot: "bg-gray-600",   text: "text-gray-500" },
};

export function StatusBadge({ status }: { status: AppStatus }) {
  const c = config[status] ?? config.pending;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-medium", c.text)}>
      <span className={clsx("w-1.5 h-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  );
}

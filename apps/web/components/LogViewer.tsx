"use client";

import { useEffect, useRef, useState } from "react";
import { streamDeployLogs } from "../lib/api";

interface Props {
  deploymentId: string;
  initialLogs?: string[];
  onDone?: (status: string) => void;
}

export function LogViewer({ deploymentId, initialLogs = [], onDone }: Props) {
  const [lines, setLines] = useState<string[]>(initialLogs);
  const [done, setDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (done) return;
    const stop = streamDeployLogs(
      deploymentId,
      (line) => setLines((prev) => [...prev, line]),
      (status) => {
        setDone(true);
        onDone?.(status);
      }
    );
    return stop;
  }, [deploymentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="bg-[#0a0a0a] border border-[#222] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#222] bg-[#111]">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#333]" />
          <span className="w-3 h-3 rounded-full bg-[#333]" />
          <span className="w-3 h-3 rounded-full bg-[#333]" />
        </div>
        <span className="text-xs text-[#555] ml-2 mono">
          {done ? "Deployment complete" : "Live logs..."}
        </span>
        {!done && (
          <span className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        )}
      </div>
      <div className="p-4 h-80 overflow-y-auto mono text-xs leading-relaxed">
        {lines.length === 0 && (
          <span className="text-[#555]">Waiting for logs...</span>
        )}
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.includes("FAILED") || line.includes("Error")
                ? "text-red-400"
                : line.includes("live at") || line.includes("success")
                ? "text-green-400"
                : line.includes("Claude") || line.includes("Analyzing")
                ? "text-blue-400"
                : "text-[#aaa]"
            }
          >
            {line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

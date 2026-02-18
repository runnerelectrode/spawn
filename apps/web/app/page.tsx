"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function signInWithGitHub() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Logo */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-5xl font-bold tracking-tight">
            <span className="text-white">spawn</span>
            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          </div>
          <p className="text-[#888] text-lg">
            Push code. We deploy it. Claude heals it.
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 text-sm">
          {[
            "AI-powered config",
            "Self-healing",
            "Auto resource scaling",
            "One-click deploy",
          ].map((f) => (
            <span
              key={f}
              className="px-3 py-1 rounded-full bg-[#111] border border-[#222] text-[#888]"
            >
              {f}
            </span>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={signInWithGitHub}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-white text-black font-semibold text-lg hover:bg-gray-100 transition disabled:opacity-50"
        >
          <GitHubIcon />
          {loading ? "Redirecting..." : "Continue with GitHub"}
        </button>

        <p className="text-[#555] text-sm">
          No config files. No YAML. No SSH.
        </p>
      </div>
    </main>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12" />
    </svg>
  );
}

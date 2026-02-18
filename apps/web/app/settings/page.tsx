"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ExternalLink, Loader2, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";

export default function SettingsPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) { router.push("/"); return; }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings/apikey`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": userId },
      body: JSON.stringify({ anthropic_api_key: key }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to save");
      setLoading(false);
      return;
    }

    setSaved(true);
    setTimeout(() => router.push("/dashboard"), 1000);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#111] border border-[#222] mb-2">
            <KeyRound className="w-5 h-5 text-[#888]" />
          </div>
          <h1 className="text-2xl font-bold">Add your Claude API key</h1>
          <p className="text-[#555] text-sm">
            Spawn uses Claude Opus 4.6 to analyze your code and self-heal deployments.
            Your key is stored securely and never shared.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              required
              className="w-full px-4 py-3 bg-[#111] border border-[#222] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#444] transition mono text-sm"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-950/30 border border-red-900 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || saved || !key}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-black font-semibold hover:bg-gray-100 transition disabled:opacity-50"
          >
            {saved ? (
              <><Check className="w-4 h-4 text-green-600" /> Saved — redirecting...</>
            ) : loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              "Save API key"
            )}
          </button>
        </form>

        <p className="text-center text-[#444] text-xs">
          Get your key at{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#666] hover:text-white underline inline-flex items-center gap-1"
          >
            console.anthropic.com <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </div>
    </div>
  );
}

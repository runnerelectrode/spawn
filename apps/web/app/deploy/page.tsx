"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Github, Loader2 } from "lucide-react";
import { createApp, triggerDeploy } from "../../lib/api";
import { LogViewer } from "../../components/LogViewer";

type Step = "form" | "deploying" | "done";

export default function DeployPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [repoUrl, setRepoUrl] = useState("");
  const [appName, setAppName] = useState("");
  const [envText, setEnvText] = useState("");
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function parseEnvText(text: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      result[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
    return result;
  }

  async function handleDeploy(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const app = await createApp({
        repo_url: repoUrl,
        name: appName || repoUrl.split("/").pop() || "my-app",
        env_vars: parseEnvText(envText),
      });

      const { deployment_id } = await triggerDeploy(app.id);
      setDeploymentId(deployment_id);
      setStep("deploying");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleDeployDone(status: string) {
    if (status === "success") {
      setStep("done");
    } else {
      setError("Deploy failed — Spawn will attempt to self-heal");
      setStep("done");
    }
  }

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-6 py-10">
      <button
        onClick={() => router.push("/dashboard")}
        className="flex items-center gap-2 text-[#555] hover:text-white text-sm mb-8 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </button>

      <h1 className="text-2xl font-bold mb-2">Deploy an app</h1>
      <p className="text-[#555] text-sm mb-8">
        Paste your GitHub repo URL. Claude will figure out the rest.
      </p>

      {step === "form" && (
        <form onSubmit={handleDeploy} className="space-y-5">
          <div>
            <label className="block text-sm text-[#888] mb-2">GitHub Repository URL</label>
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555]" />
              <input
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/you/your-app"
                required
                className="w-full pl-10 pr-4 py-3 bg-[#111] border border-[#222] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#444] transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[#888] mb-2">
              App name <span className="text-[#444]">(optional)</span>
            </label>
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="my-app"
              className="w-full px-4 py-3 bg-[#111] border border-[#222] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#444] transition"
            />
          </div>

          <div>
            <label className="block text-sm text-[#888] mb-2">
              Environment variables <span className="text-[#444]">(paste .env format)</span>
            </label>
            <textarea
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder={"DATABASE_URL=postgresql://...\nOPENAI_API_KEY=sk-..."}
              rows={5}
              className="w-full px-4 py-3 bg-[#111] border border-[#222] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#444] transition mono text-sm resize-none"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-950/30 border border-red-900 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !repoUrl}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-black font-semibold text-base hover:bg-gray-100 transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? "Starting deploy..." : "Deploy with Spawn"}
          </button>

          <p className="text-center text-[#444] text-xs">
            Claude Opus 4.6 will analyze your code and configure the deployment automatically.
          </p>
        </form>
      )}

      {step === "deploying" && deploymentId && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-[#111] border border-[#222]">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <div>
              <p className="text-sm font-medium">Deploying your app</p>
              <p className="text-xs text-[#555]">Claude is analyzing your code and configuring the deployment</p>
            </div>
          </div>
          <LogViewer deploymentId={deploymentId} onDone={handleDeployDone} />
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4">
          {error ? (
            <div className="p-5 rounded-xl bg-red-950/20 border border-red-900">
              <p className="font-semibold text-red-400 mb-1">Deploy failed</p>
              <p className="text-sm text-[#888]">{error}</p>
              <p className="text-sm text-[#555] mt-2">Spawn&apos;s self-healer is monitoring and will retry automatically.</p>
            </div>
          ) : (
            <div className="p-5 rounded-xl bg-green-950/20 border border-green-900">
              <p className="font-semibold text-green-400 mb-1">Your app is live</p>
              {liveUrl && (
                <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-green-300 underline">
                  {liveUrl}
                </a>
              )}
            </div>
          )}
          {deploymentId && <LogViewer deploymentId={deploymentId} />}
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full py-3 rounded-xl border border-[#222] text-[#888] hover:text-white hover:border-[#333] transition text-sm"
          >
            Go to dashboard
          </button>
        </div>
      )}
    </div>
  );
}

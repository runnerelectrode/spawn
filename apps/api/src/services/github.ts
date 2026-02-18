import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import simpleGit from "simple-git";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { RepoSnapshot } from "../agents/analyzer";

const REPOS_DIR = process.env.REPOS_DIR ?? "/tmp/spawn-repos";

function getAppOctokit() {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    },
  });
}

export async function getInstallationOctokit(installationId: number) {
  const appOctokit = getAppOctokit();
  const { token } = await appOctokit.auth({
    type: "installation",
    installationId,
  } as any) as any;

  return new Octokit({ auth: token });
}

export async function cloneOrPullRepo(
  repoFullName: string,
  installationId: number,
  commitSha?: string
): Promise<string> {
  const octokit = await getInstallationOctokit(installationId);
  const { token } = await (getAppOctokit().auth as any)({
    type: "installation",
    installationId,
  });

  const repoDir = join(REPOS_DIR, repoFullName.replace("/", "_"));

  if (!existsSync(REPOS_DIR)) mkdirSync(REPOS_DIR, { recursive: true });

  const cloneUrl = `https://x-access-token:${token}@github.com/${repoFullName}.git`;
  const git = simpleGit();

  if (existsSync(repoDir)) {
    await simpleGit(repoDir).pull("origin", "main").catch(() =>
      simpleGit(repoDir).pull("origin", "master")
    );
  } else {
    await git.clone(cloneUrl, repoDir, ["--depth", "1"]);
  }

  if (commitSha) {
    await simpleGit(repoDir).checkout(commitSha).catch(() => {});
  }

  return repoDir;
}

export async function buildRepoSnapshot(repoDir: string): Promise<RepoSnapshot> {
  const { readFileSync, existsSync: exists } = await import("fs");
  const { execSync } = await import("child_process");

  function read(path: string): string | undefined {
    const full = join(repoDir, path);
    return exists(full) ? readFileSync(full, "utf-8").slice(0, 6000) : undefined;
  }

  // Build file tree (limit depth and count to avoid token explosion)
  let fileTree = "";
  try {
    fileTree = execSync(
      `find . -type f -not -path './.git/*' -not -path './node_modules/*' -not -path './__pycache__/*' | sort | head -120`,
      { cwd: repoDir }
    ).toString();
  } catch {
    fileTree = "Could not generate file tree";
  }

  // Try to find main entry file
  const candidates = [
    "src/index.ts", "src/index.js", "src/app.ts", "src/app.js",
    "index.ts", "index.js", "app.ts", "app.py", "main.py",
    "server.ts", "server.js", "server.py",
  ];
  let mainEntry: string | undefined;
  for (const c of candidates) {
    const content = read(c);
    if (content) { mainEntry = `// ${c}\n${content}`; break; }
  }

  // Also check .env.example for required vars
  const envExample = read(".env.example") ?? read(".env.sample") ?? read(".env.template");

  return {
    fileTree,
    packageJson: read("package.json"),
    dockerfile: read("Dockerfile") ?? read("dockerfile"),
    requirements: read("requirements.txt") ?? read("requirements-prod.txt"),
    goMod: read("go.mod"),
    cargoToml: read("Cargo.toml"),
    gemfile: read("Gemfile"),
    composerJson: read("composer.json"),
    mainEntry: mainEntry
      ? (envExample ? `${mainEntry}\n\n// .env.example:\n${envExample}` : mainEntry)
      : envExample ? `// .env.example:\n${envExample}` : undefined,
  };
}

export async function getLatestCommit(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{ sha: string; message: string }> {
  const { data } = await octokit.repos.listCommits({ owner, repo, per_page: 1 });
  return { sha: data[0].sha, message: data[0].commit.message };
}

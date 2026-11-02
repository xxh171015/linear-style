import { run, cursor } from "@ai-hero/sandcastle";
import { bwrap } from "@ai-hero/sandcastle/sandboxes/bwrap";
import { seatbelt } from "@ai-hero/sandcastle/sandboxes/seatbelt";

// Linear XXH simple loop — implement ready-for-agent issues, then open a PR
// using Matt's /pr body template + gh. Run: pnpm sandcastle
// Requires in .sandcastle/.env: LINEAR_API_KEY, CURSOR_API_KEY, GH_TOKEN.
// Host: jq + gh + Homebrew git; linear CLI on PATH (scripts fall back to npx).

const isDarwin = process.platform === "darwin";
const home = process.env.HOME ?? "";

function runStamp(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(16).slice(2, 8);
  return `${stamp}-${rand}`;
}

const workerBranch = `sandcastle/linear-xxh-worker/${runStamp()}`;

/** Seatbelt denies `/Applications`; Apple Git pulls in xcodebuild. Prefer Homebrew Git on PATH. */
function darwinSandbox() {
  const pathParts = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    home ? `${home}/.cargo/bin` : "",
    home ? `${home}/.local/bin` : "",
    process.env.PATH ?? "",
  ].filter(Boolean);
  const env = { PATH: [...new Set(pathParts.join(":").split(":"))].join(":") };
  // Cursor CLI writes under `/tmp/.cursor` (not always `$TMPDIR`).
  const mounts = [{ hostPath: "/tmp", sandboxPath: "/tmp", readonly: false as const }];
  return seatbelt({ env, mounts });
}

const ghReadyCommand = [
  "command -v gh >/dev/null || { echo 'gh not on PATH — brew install gh on the host' >&2; exit 1; }",
  'test -n "${GH_TOKEN}${GITHUB_TOKEN}" || { echo "GH_TOKEN missing in .sandcastle/.env (sandbox hides host gh login)" >&2; exit 1; }',
  // Writes into the sandbox HOME, so git push / gh pr create work without osxkeychain.
  "gh auth setup-git >/dev/null",
].join("; ");

const sandboxReadyCommand = isDarwin
  ? ghReadyCommand
  : [
      ghReadyCommand,
      "command -v jq >/dev/null || (sudo apt-get update && sudo apt-get install -y jq)",
      "command -v linear >/dev/null || npm install -g @schpet/linear-cli",
      "pnpm install",
    ].join("; ");

await run({
  name: "linear-xxh-worker",

  sandbox: isDarwin ? darwinSandbox() : bwrap(),
  // Docker alternative (needs image build + linear-cli in Dockerfile):
  // import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
  // sandbox: docker(),

  agent: cursor("auto"),

  promptFile: "./.sandcastle/prompt.md",

  maxIterations: 3,

  // Named branch so this loop can push and open a PR. merge-to-head would
  // land on local main with nothing to PR.
  branchStrategy: { type: "branch", branch: workerBranch, baseBranch: "main" },

  // .agents is gitignored; copy Matt skills the AFK loop follows.
  copyToWorktree: [
    "node_modules",
    ".agents/skills/pr",
    ".agents/skills/implement",
    ".agents/skills/tdd",
    ".agents/skills/code-review",
  ],

  hooks: {
    sandbox: {
      onSandboxReady: [
        {
          command: sandboxReadyCommand,
        },
      ],
    },
  },
});

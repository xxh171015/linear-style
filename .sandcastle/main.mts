import { run, cursor } from "@ai-hero/sandcastle";
import { bwrap } from "@ai-hero/sandcastle/sandboxes/bwrap";
import { seatbelt } from "@ai-hero/sandcastle/sandboxes/seatbelt";

// Linear XXH simple loop — picks ready-for-agent issues and closes them.
// Run: pnpm sandcastle
// Requires: LINEAR_API_KEY in .sandcastle/.env (see .env.example).
// Host: jq + linear CLI on PATH (scripts fall back to npx for linear-cli).

const isDarwin = process.platform === "darwin";

/** Seatbelt denies `/Applications`; Apple Git pulls in xcodebuild. Prefer Homebrew Git on PATH. */
function darwinSandbox() {
  const pathParts = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    process.env.PATH ?? "",
  ].filter(Boolean);
  const env = { PATH: [...new Set(pathParts.join(":").split(":"))].join(":") };
  // Cursor CLI writes under `/tmp/.cursor` (not always `$TMPDIR`).
  const mounts = [{ hostPath: "/tmp", sandboxPath: "/tmp", readonly: false as const }];
  return seatbelt({ env, mounts });
}

const sandboxReadyCommand = isDarwin
  ? "true"
  : [
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

  branchStrategy: { type: "merge-to-head" },

  copyToWorktree: ["node_modules"],

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

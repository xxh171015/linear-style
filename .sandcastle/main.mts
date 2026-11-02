import { run, cursor } from "@ai-hero/sandcastle";
import { bwrap } from "@ai-hero/sandcastle/sandboxes/bwrap";

// Linear XXH simple loop — picks ready-for-agent issues and closes them.
// Run: pnpm sandcastle
// Requires: LINEAR_API_KEY in .sandcastle/.env (see .env.example), @schpet/linear-cli available in sandbox PATH via onSandboxReady.

await run({
  name: "linear-xxh-worker",

  // Native Linux sandbox (Bubblewrap). On macOS use seatbelt(); for Docker see comment below.
  sandbox: bwrap(),
  // Docker alternative (needs image build + linear-cli in Dockerfile):
  // import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
  // sandbox: docker(),

  // Cursor agent on the host CLI. Swap to claudeCode("claude-sonnet-4-6") if preferred.
  agent: cursor("auto"),  // change model id as needed for your Cursor CLI

  promptFile: "./.sandcastle/prompt.md",

  maxIterations: 3,

  branchStrategy: { type: "merge-to-head" },

  copyToWorktree: ["node_modules"],

  hooks: {
    sandbox: {
      onSandboxReady: [
        {
          // Ensure Linear CLI + jq exist for LIST/VIEW/CLOSE scripts.
          command:
            "command -v jq >/dev/null || (sudo apt-get update && sudo apt-get install -y jq); command -v linear >/dev/null || npm install -g @schpet/linear-cli; pnpm install",
        },
      ],
    },
  },
});

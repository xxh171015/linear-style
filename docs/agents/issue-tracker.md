# Issue tracker: Linear (team XXH)

Issues and specs for this repo live in **Linear**, not GitHub Issues.

| Field                   | Value                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Workspace               | [xuxinghua](https://linear.app/xuxinghua)                                                                    |
| Team key                | `XXH`                                                                                                        |
| Issue IDs               | `XXH-<n>` (e.g. `XXH-11`)                                                                                    |
| Project (optional home) | 个人研发节奏试用                                                                                             |
| CLI (preferred)         | [`@schpet/linear-cli`](https://github.com/schpet/linear-cli) (`linear` on PATH, or `npx @schpet/linear-cli`) |
| Official `@linear/cli`  | **Do not use** — abandoned (`lin new` / `lin checkout` only, last useful publish 2021)                       |
| MCP                     | Optional for interactive agents; **not** enough for Sandcastle (needs shell LIST/VIEW/CLOSE)                 |

Domain language (`GLOSSARY.md`, `docs/adr/`) lives in **git**. Do not treat Linear long descriptions as the glossary/ADR source of truth.

**PRs as a request surface: no.** GitHub PRs are implementation vehicles (`Fixes XXH-n`); they are not triage intake.

---

## Auth

Create a personal API key: https://linear.app/settings/account/security → Personal API keys (`lin_api_…`). Member access required.

**Non-interactive / CI / Sandcastle (preferred for agents):**

```bash
export LINEAR_API_KEY="lin_api_..."
export LINEAR_TEAM_ID="XXH"          # default team for create/list when flags omit --team
# optional: export LINEAR_WORKSPACE="xuxinghua"
```

`LINEAR_API_KEY` wins over stored credentials. Do not combine it with `--workspace` (the key already selects the workspace).

**Interactive human setup:**

```bash
npx @schpet/linear-cli auth login --key "$LINEAR_API_KEY"
# or: linear auth login
cd "$(git rev-parse --show-toplevel)"
npx @schpet/linear-cli config   # writes .linear.toml (team_id / workspace)
```

Recommended committed project config (no secrets):

```toml
# .linear.toml
workspace = "xuxinghua"
team_id = "XXH"
issue_create_assign_self = "never"
issue_create_ask_project = false
```

Always pass `--no-input` in scripts so missing flags fail instead of prompting.

---

## Label vocabulary (Matt triage roles → Linear)

| Role in mattpocock/skills | Label / place in Linear                                                   | Meaning                                            | Enter Cycle? |
| ------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- | ------------ |
| `needs-triage`            | **Triage inbox** (workflow state `Triage`); optional label `needs-triage` | Just arrived; maintainer must evaluate             | No           |
| `needs-info`              | Label **`needs-spec`**                                                    | Spec incomplete; grill / to-spec before scheduling | No           |
| `ready-for-agent`         | Label **`ready-for-agent`**                                               | Fully specified + Agent Brief; AFK-safe            | Yes (Focus)  |
| `ready-for-human`         | Label **`ready-for-human`**                                               | Requires a human implementer                       | Yes          |
| `wontfix`                 | Label **`wontfix`**, then cancel                                          | Will not be actioned                               | No           |

Hard rule for this repo: **no Cycle placement without `ready-for-agent` or `ready-for-human`.** Tickets still labelled `needs-spec` stay in Triage/Backlog.

Applying `ready-for-agent` is not enough for Sandcastle by itself: Linear creates issues in **Triage**, and `/to-tickets` children inherit that. Always pass **`--state Backlog`** on create or update when labelling `ready-for-agent`. LIST also includes Triage as a safety net so a forgotten state move still shows up.

Ensure labels exist once (idempotent create is fine if already present):

```bash
linear label create --team XXH --name needs-spec --yes --no-input
linear label create --team XXH --name ready-for-agent --yes --no-input
linear label create --team XXH --name ready-for-human --yes --no-input
linear label create --team XXH --name wontfix --yes --no-input
# optional mirror of Matt's needs-triage string:
linear label create --team XXH --name needs-triage --yes --no-input
```

---

## Conventions (agent copy-paste)

Prefix every command with `npx @schpet/linear-cli` if `linear` is not on PATH. Examples below assume `linear` is available.

### Create an issue

```bash
cat > /tmp/issue-body.md <<'MD'
## Problem
...

## Acceptance criteria
- [ ] ...
MD

linear issue create \
  --team XXH \
  --title "Short title" \
  --description-file /tmp/issue-body.md \
  --label needs-spec \
  --no-input \
  --yes
```

Optional flags: `--project "个人研发节奏试用"`, `--parent XXH-5`, `--priority high|medium|low|urgent|none`, `--state Triage|Backlog`, `--cycle active|next`.

`ready-for-agent` issues **must** leave Triage:

```bash
linear issue create \
  --team XXH \
  --title "Child slice" \
  --parent XXH-5 \
  --description-file /tmp/issue-body.md \
  --label ready-for-agent \
  --state Backlog \
  --no-input \
  --yes
```

Prefer `--description-file` / `--body-file` for any multi-line Markdown (avoids shell escaping and literal `\n`).

### Read an issue

```bash
linear issue view XXH-11 --json --no-input
# human-readable (includes comments):
linear issue view XXH-11 --no-input
linear issue comment list XXH-11 --json --no-input
```

### List issues

```bash
# Team backlog slice
linear issue query --team XXH --all-states --json --limit all --no-input

# Triage / needs-spec
linear issue query --team XXH --state triage --json --limit all --no-input
linear issue query --team XXH --label needs-spec --json --limit all --no-input

# AFK queue (Sandcastle LIST — see below)
linear issue query --team XXH --label ready-for-agent \
  --state triage --state unstarted --state started --state backlog \
  --json --limit all --no-input
```

Shape tip: prefer `--json` and map with `jq` to `{id: .identifier, title, body: .description}` when a skill expects GitHub-like fields.

### Comment

```bash
cat > /tmp/comment.md <<'MD'
## Agent Brief
- Goal: ...
- Out of scope: ...
- Verify: ...
MD
linear issue comment add XXH-11 --body-file /tmp/comment.md --no-input --yes
```

### Apply / remove labels

```bash
# Add without wiping others
linear issue update XXH-11 --add-label ready-for-agent --no-input
linear issue update XXH-11 --remove-label needs-spec --no-input

# Atomic swap (recommended when leaving needs-spec)
linear issue update XXH-11 \
  --remove-label needs-spec \
  --add-label ready-for-agent \
  --state Backlog \
  --no-input

# Replace entire label set (destructive)
linear issue update XXH-11 --label ready-for-agent --no-input
```

### Close / cancel

```bash
# Done
linear issue comment add XXH-11 --body "Completed." --no-input --yes
linear issue update XXH-11 --state Done --no-input

# Cancel / wontfix
linear issue update XXH-11 --add-label wontfix --state Canceled --no-input
```

Prefer `Done` / `Canceled` over `issue archive` (archive bypasses Linear's normal checks and hides the issue from default lists).

### Parent / sub-issue

`/to-spec` lives on the **parent**. `/to-tickets` creates **children** that Sandcastle executes. Do not close or rewrite the parent while splitting.

| When                      | Parent                                                                                        | Children                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Splitting (`/to-tickets`) | Keep open. Spec stays on the parent. Remove `ready-for-agent` so LIST does not grab the spec. | Create with `--parent`, `--label ready-for-agent`, `--state Backlog`.   |
| Sandcastle CLOSE          | Do **not** close.                                                                             | Close the child that was implemented (`scripts/linear-close.sh XXH-n`). |
| **Every child is Done**   | Set parent to **Done**. Spec remains readable on the Done issue.                              | Already Done.                                                           |
| More slices still planned | Leave parent open, but **not in Triage** (use Backlog).                                       | New children as above.                                                  |

Do not leave a finished spec in **Triage**: it looks unprocessed. Do not archive the parent to keep the spec; Done is enough.

```bash
# At create time (AFK child: leave Triage)
linear issue create --team XXH --title "Child slice" --parent XXH-5 \
  --description-file /tmp/body.md \
  --label ready-for-agent --state Backlog \
  --no-input --yes

# After the fact
linear issue update XXH-12 --parent XXH-5 --no-input
linear issue update XXH-12 --clear-parent --no-input

# All children Done → close the spec parent (not Sandcastle's job)
linear issue update XXH-13 --state Done --no-input
```

### Blocked-by / blocks / related

Native Linear relations (UI-visible):

```bash
# XXH-12 is blocked by XXH-11
linear issue relation add XXH-12 blocked-by XXH-11 --no-input

# XXH-11 blocks XXH-12 (inverse wording)
linear issue relation add XXH-11 blocks XXH-12 --no-input

linear issue relation list XXH-12 --no-input
linear issue relation delete XXH-12 blocked-by XXH-11 --yes --no-input
```

Also allowed: `related`, `duplicate`.

Fallback if relations are unavailable: put `Blocked by: XXH-11` at the top of the child description.

### Move into Cycle / Project

```bash
linear issue update XXH-11 --project "个人研发节奏试用" --cycle active --no-input
```

---

## When a skill says "publish to the issue tracker"

Create a **Linear** issue on team `XXH` (commands above). Do **not** open a GitHub Issue unless the user explicitly asks.

## When a skill says "fetch the relevant ticket"

`linear issue view <ID> --json` (and comments via `linear issue comment list <ID> --json`).

---

## Sandcastle custom tracker (LIST / VIEW / CLOSE)

See `docs/agents/sandcastle.md` for the AFK loop runbook (`pnpm sandcastle`).

Sandcastle has no first-party Linear integration. Use `sandcastle init --issue-tracker custom`, then wire these non-interactive commands (MCP alone is insufficient).

Wrapper scripts live under `scripts/` (optional but recommended):

| Slot      | Command                        |
| --------- | ------------------------------ |
| **LIST**  | `scripts/linear-list-ready.sh` |
| **VIEW**  | `scripts/linear-view.sh <ID>`  |
| **CLOSE** | `scripts/linear-close.sh <ID>` |

Equivalent one-liners:

```bash
# LIST — JSON array of ready-for-agent issues
linear issue query --team XXH --label ready-for-agent \
  --state triage --state unstarted --state started --state backlog \
  --json --limit all --no-input \
  | jq '[.[] | {id: .identifier, number: .identifier, title, body: (.description // ""), labels: [.labels[].name]}]'

# VIEW
linear issue view <ID> --json --no-input

# CLOSE
linear issue comment add <ID> --body "Completed by Sandcastle" --no-input --yes \
  && linear issue update <ID> --state Done --no-input
```

Sandbox Dockerfile install sketch:

```dockerfile
# Install @schpet/linear-cli binary (pin a release in real use)
RUN curl -LsSf https://github.com/schpet/linear-cli/releases/latest/download/linear-installer.sh | sh
```

`.env` / `.env.example`:

```bash
LINEAR_API_KEY=
LINEAR_TEAM_ID=XXH
CURSOR_API_KEY=
GH_TOKEN=
```

---

## GraphQL / curl fallback

Use when `linear` cannot be installed. Auth header is the raw API key (same `LINEAR_API_KEY`).

```bash
# Viewer smoke test
curl -sS https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{"query":"{ viewer { id name } }"}'
```

Create / update via GraphQL when needed; resolve team UUID once:

```bash
curl -sS https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{"query":"{ teams { nodes { id key name } } }"}'
```

Or via CLI without hand-writing the schema:

```bash
linear api --variables-json '{"filter":{"team":{"key":{"eq":"XXH"}},"labels":{"name":{"eq":"ready-for-agent"}}}}' <<'GRAPHQL'
query($filter: IssueFilter!) {
  issues(filter: $filter, first: 100) {
    nodes { identifier title description state { name } labels { nodes { name } } }
  }
}
GRAPHQL
```

Prefer dedicated `linear issue *` subcommands over raw GraphQL whenever they cover the operation.

---

## GitHub ↔ Linear

- Sandcastle AFK: named branch `sandcastle/linear-xxh-worker/<stamp>`, Matt `/pr` body, then `git push` + `gh pr create` (needs `GH_TOKEN` in `.sandcastle/.env`; sandbox cannot use host `gh` login or osxkeychain).
- Interactive human: Linear's suggested branch (`xxh-11-…`) via `linear issue start XXH-11`, then `/pr` in Cursor.
- PR body / commits: include `Fixes XXH-11` (or `Refs XXH-11`) so the Linear↔GitHub integration can close/link.
- Do not file product specs as GitHub Issues for this repo.

---

## Out of scope for this file

- Glossary / ADR layout → see `docs/agents/domain.md` (when present) and root `GLOSSARY.md`.
- Exact Matt label-role table duplicate → keep overrides here; optional `docs/agents/triage-labels.md` may mirror the table above.

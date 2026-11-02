# Sandcastle ↔ Linear (XXH)

AFK loop for issues labelled `ready-for-agent`. Specs/triage stay in Linear + Matt skills (`grill-with-docs` / `to-spec` / `to-tickets`); Sandcastle implements the ready queue and opens the GitHub PR with Matt’s `/pr` body template.

Grill cannot run here: it interviews you. Implement + `/pr` can.

## One-time setup

1. `pnpm add -D @ai-hero/sandcastle tsx`
2. Copy `.sandcastle/.env.example` → `.sandcastle/.env` and set:
   - `LINEAR_API_KEY`
   - `CURSOR_API_KEY` (host `agent login` is not visible inside the sandbox)
   - `GH_TOKEN` (`gh auth token` on the host; sandbox cannot see `gh auth login` or osxkeychain)
3. Ensure labels exist (`ready-for-agent`, etc.) — see `docs/agents/issue-tracker.md`.
4. macOS: `brew install git jq gh` (Apple `/usr/bin/git` breaks inside `seatbelt()`). Linux: Bubblewrap (`bwrap()`). Or switch to `docker()` in `main.mts`.
5. Host needs the Cursor agent CLI on `PATH` if using `cursor()` (or change agent to `claudeCode(...)`).

## Run

```bash
pnpm sandcastle
# → npx tsx .sandcastle/main.mts
```

Each run uses a named branch `sandcastle/linear-xxh-worker/<stamp>` (not merge-to-head). The agent implements AFK (no questions, no status reports), commits, writes a `/pr` body, `git push`, `gh pr create`, then closes the Linear child.

It only stops a ticket when user-visible behaviour is unspecified in the spec: it leaves a **Needs your decision** comment on the Linear issue, does not close it, and moves on. Check Linear, not the Sandcastle transcript, for those.

## How tickets flow

1. Grill / to-spec / to-tickets (or triage) until Agent Brief exists.
2. Label `ready-for-agent` (remove `needs-spec`) **and move out of Triage** (`--state Backlog`). Linear’s default for new `/to-tickets` children is Triage; without this, Sandcastle used to skip them. LIST now also includes Triage as a safety net. Optionally put in Cycle.
3. Sandcastle LIST = `scripts/linear-list-ready.sh`.
4. Agent implements AFK (`/implement` + TDD at spec seams + review vs `main`) → `RALPH:` commit with `Fixes XXH-n` → Matt `/pr` body → `git push` + `gh pr create` → `scripts/linear-close.sh XXH-n` (the **child**, never the spec parent). If a product decision is missing, Linear comment **Needs your decision** instead of guessing.
5. When **every** child is Done, a maintainer (or a later skill run) sets the parent Spec to **Done**. Sandcastle must not close the parent just because one child finished.

## Not Sandcastle’s job

- Requirements interviewing (`grill-with-docs`)
- Glossary / ADR authorship
- Triage inbox governance
- Closing spec parents after `/to-tickets` (see `docs/agents/issue-tracker.md` → Parent / sub-issue)

Those stay Matt skills + Linear in Cursor.

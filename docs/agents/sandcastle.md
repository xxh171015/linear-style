# Sandcastle ↔ Linear (XXH)

AFK loop for issues labelled `ready-for-agent`. Specs/triage stay in Linear + Matt skills; Sandcastle only executes the ready queue.

## One-time setup

1. `pnpm add -D @ai-hero/sandcastle tsx`
2. Copy `.sandcastle/.env.example` → `.sandcastle/.env` and set `LINEAR_API_KEY` (and agent auth vars).
3. Ensure labels exist (`ready-for-agent`, etc.) — see `docs/agents/issue-tracker.md`.
4. Host needs Bubblewrap (`bwrap`) on Linux, or switch `main.mts` to `seatbelt()` / `docker()`.
5. Host needs the Cursor agent CLI on `PATH` if using `cursor()` (or change agent to `claudeCode(...)`).

## Run

```bash
pnpm sandcastle
# → npx tsx .sandcastle/main.mts
```

## How tickets flow

1. Grill / to-spec / to-tickets (or triage) until Agent Brief exists.
2. Label `ready-for-agent` (remove `needs-spec`); optionally put in Cycle.
3. Sandcastle LIST = `scripts/linear-list-ready.sh`.
4. Agent implements → `RALPH:` commit → `scripts/linear-close.sh XXH-n`.

## Not Sandcastle’s job

- Requirements interviewing (`grill-with-docs`)
- Glossary / ADR authorship
- Triage inbox governance

Those stay Matt skills + Linear.

## Agent skills

### Issue tracker

Specs and tickets live in the AFK platform (the `plat` CLI), not in the code host's issues. See `docs/agents/issue-tracker.md`.

### Triage labels

The default label strings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Tests

`pnpm test` runs Vitest (`src/**/*.test.ts`). `pnpm typecheck` runs `tsc -b`.

## Running unattended

Nobody answers questions during a run. When a decision only a person can make comes up, the agent reports `cannot-proceed` and ends.

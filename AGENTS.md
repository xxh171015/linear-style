# linear-style

A Vite + React replica of Linear's Issue, Project, and Custom View product logic. One ambient Team (`XXH`). There is no backend: product rules live in an in-memory kernel; the UI reads seed data from the repo.

## Layout

- `src/kernel.ts` — product rules (Issue, Project, Custom View, grouping, progress). Behaviour belongs here.
- `src/types.ts` — domain types
- `src/logic.ts` — hash routing and UI helpers
- `src/data.ts` — seed data
- `src/App.tsx`, `src/screens.tsx`, `src/icons.tsx` — UI
- `src/kernel.test.ts` — kernel tests
- `GLOSSARY.md`, `docs/adr/` — domain language and decisions
- `docs/agents/` — tracker, triage, and domain-doc conventions

Use the glossary's words. Do not reach for Linear schema names the glossary tells you to avoid.

## Commands

Package manager: pnpm.

- Install: `pnpm install --frozen-lockfile`
- Dev: `pnpm dev` (Vite on `127.0.0.1:5174`)
- Typecheck: `pnpm typecheck`
- Test: `pnpm test` (Vitest, node environment, `src/**/*.test.ts`; JUnit at `reports/junit.xml`)
- Build: `pnpm build`

There is no lint script.

## Conventions

- Product behaviour lives in `src/kernel.ts` and is covered by `src/kernel.test.ts`. The UI calls the kernel; it does not reimplement rules.
- Issue statuses are exactly `backlog`, `todo`, `progress`, `done`, `canceled`.
- This replica has one Team, treated as environment, not a thing the user switches.
- Domain language: `GLOSSARY.md` and `docs/adr/`.

## Running unattended

Nobody answers questions during a run. When a decision only a person can make comes up, the agent reports `cannot-proceed` and ends.

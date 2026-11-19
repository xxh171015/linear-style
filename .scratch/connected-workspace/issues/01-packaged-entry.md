# 01: Packaged entry stays green

**What to build:** A member can install and package this app from the current scripts without a broken entry or lockfile mismatch.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] `pnpm install --frozen-lockfile` succeeds on HEAD
- [x] Test, typecheck, build, and `desktop:package` succeed on HEAD scripts
- [x] No extra install or package scripts are required to get a runnable desktop build

## Answer

Gate is green on `feat/connected-workspace` at `e622685`. Frozen lockfile install, 243 tests, typecheck, build, and `desktop:package` all exited 0 using the existing scripts. Output: `artifacts/desktop/云镜-darwin-arm64`. No product commit.

Packager still skips `desktop/app-icon.icns` (bundle uses `electron.icns`). README still cites the old `Linear Replica-darwin-arm64` path. Neither blocks this ticket.

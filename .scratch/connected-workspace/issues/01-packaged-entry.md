# 01: Packaged entry stays green

**What to build:** A member can install and package this app from the current scripts without a broken entry or lockfile mismatch.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [ ] `pnpm install --frozen-lockfile` succeeds on HEAD
- [ ] Test, typecheck, build, and `desktop:package` succeed on HEAD scripts
- [ ] No extra install or package scripts are required to get a runnable desktop build

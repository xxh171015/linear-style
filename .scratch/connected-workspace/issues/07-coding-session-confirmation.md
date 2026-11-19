# 07: Coding session Confirmation

**What to build:** A Coding session is an argv spawn on the account-server host. Agent may propose one; it only starts after a member confirms the Inbox item. Secrets never enter the child environment.

**Blocked by:** 03 Workspace Connections in Settings; 05 GitHub Review projection and merge Confirmation

**Status:** resolved

- [x] Admin configures argv plus an absolute working directory that must exist; missing cwd or binary fails the session
- [x] Whole-argument tokens `{issueId}`, `{title}`, and `{repoPath}` substitute; in-string `{…}` is refused
- [x] Child env is PATH, HOME, and LANG only; timeout is 30 minutes
- [x] An Agent-proposed Coding session appears as an Inbox Confirmation and does not spawn from chat alone
- [x] Confirm runs the spawn; dismiss does not execute; fan-out and any-member confirm/dismiss follow the Confirmation rules from 05

## Answer

Landed on `feat/connected-workspace` as `d148c12`. Product code already spawned correctly; commit adds HTTP and argv-seam proofs for Agent-proposed Confirmation, confirm/dismiss, missing cwd/binary, env PATH/HOME/LANG, and 30-minute timeout. Loop coding enqueue stays ticket 08.

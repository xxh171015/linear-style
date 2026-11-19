# 07: Coding session Confirmation

**What to build:** A Coding session is an argv spawn on the account-server host. Agent may propose one; it only starts after a member confirms the Inbox item. Secrets never enter the child environment.

**Blocked by:** 03 Workspace Connections in Settings; 05 GitHub Review projection and merge Confirmation

**Status:** ready-for-agent

- [ ] Admin configures argv plus an absolute working directory that must exist; missing cwd or binary fails the session
- [ ] Whole-argument tokens `{issueId}`, `{title}`, and `{repoPath}` substitute; in-string `{…}` is refused
- [ ] Child env is PATH, HOME, and LANG only; timeout is 30 minutes
- [ ] An Agent-proposed Coding session appears as an Inbox Confirmation and does not spawn from chat alone
- [ ] Confirm runs the spawn; dismiss does not execute; fan-out and any-member confirm/dismiss follow the Confirmation rules from 05

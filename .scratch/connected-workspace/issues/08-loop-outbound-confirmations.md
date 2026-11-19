# 08: Loops enqueue GitHub and coding Confirmations

**What to build:** A Loop never merges, comments, or starts a Coding session itself. Those actions enqueue a pending Confirmation. Signed-in Run now runs on the account server and fans out to every member.

**Blocked by:** 04 Hosted Loop interval ticks; 05 GitHub Review projection and merge Confirmation; 07 Coding session Confirmation

**Status:** resolved

- [x] Enabled Loops may call the model and may assign, raise priority, or summarize without a UI
- [x] A Loop GitHub write or Coding session enqueues a pending Confirmation; the LoopRun is `pending`, not `limited`
- [x] `limited` remains “not connected”; waiting on Inbox is `pending`
- [x] Signed-in Run now applies on the account server; Confirmations fan out to all members, including those with no personal snapshot yet
- [x] Confirm executes the GitHub write or Coding session as the Connection owner; dismiss finishes the LoopRun as `failed` (cancelled) and does not execute

## Answer

Landed on `feat/connected-workspace` as `238de89`. Loops enqueue GitHub merge and coding Confirmations (`pending`, not `limited`); signed-in Run now fans out, including members with no personal snapshot; confirm runs as the Connection owner and dismiss cancels. Remaining gaps: Loop GitHub write is merge only (no comment/approve Loop actions); summarize Loops call the model on signed-in Run now, not on interval ticks.

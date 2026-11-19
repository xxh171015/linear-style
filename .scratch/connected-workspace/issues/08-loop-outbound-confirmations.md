# 08: Loops enqueue GitHub and coding Confirmations

**What to build:** A Loop never merges, comments, or starts a Coding session itself. Those actions enqueue a pending Confirmation. Signed-in Run now runs on the account server and fans out to every member.

**Blocked by:** 04 Hosted Loop interval ticks; 05 GitHub Review projection and merge Confirmation; 07 Coding session Confirmation

**Status:** ready-for-agent

- [ ] Enabled Loops may call the model and may assign, raise priority, or summarize without a UI
- [ ] A Loop GitHub write or Coding session enqueues a pending Confirmation; the LoopRun is `pending`, not `limited`
- [ ] `limited` remains “not connected”; waiting on Inbox is `pending`
- [ ] Signed-in Run now applies on the account server; Confirmations fan out to all members, including those with no personal snapshot yet
- [ ] Confirm executes the GitHub write or Coding session as the Connection owner; dismiss finishes the LoopRun as `failed` (cancelled) and does not execute

# 05: GitHub Review projection and merge Confirmation

**What to build:** With a GitHub Connection, a Review is a pull-request projection. Approve and request-changes go to GitHub immediately; Merge waits in Inbox as a Confirmation that any member can confirm or dismiss. Writes appear as the Workspace PAT owner.

**Blocked by:** 03 Workspace Connections in Settings

**Status:** ready-for-agent

- [ ] A Review with a github.com pull URL becomes a projection (`owner/repo/number`) when GitHub is connected; pasted-diff Reviews remain when it is not
- [ ] URLs outside the allow list are refused; comments are the PR conversation thread only (no line/hunk comments)
- [ ] Reviews refresh on list or connected Review open, on pull URL save, and about every 60 seconds while that page stays open; no webhooks; no full-repo scan while no client is looking
- [ ] CI shows Actions runs plus commit statuses
- [ ] Approve and request-changes call GitHub immediately; they are not Confirmations
- [ ] Merge enqueues an Inbox Confirmation (kind distinct from reminder); the UI says the write appears as the PAT owner; merge uses the repository’s GitHub default method
- [ ] Any member may confirm or dismiss; confirm performs the merge; dismiss does not execute; Confirmations fan out to every member, including those with no personal snapshot yet
- [ ] Dismiss finishes a waiting LoopRun as `failed` (cancelled) when one is attached

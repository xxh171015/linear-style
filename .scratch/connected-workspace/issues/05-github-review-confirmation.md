# 05: GitHub Review projection and merge Confirmation

**What to build:** With a GitHub Connection, a Review is a pull-request projection. Approve and request-changes go to GitHub immediately; Merge waits in Inbox as a Confirmation that any member can confirm or dismiss. Writes appear as the Workspace PAT owner.

**Blocked by:** 03 Workspace Connections in Settings

**Status:** resolved

- [x] A Review with a github.com pull URL becomes a projection (`owner/repo/number`) when GitHub is connected; pasted-diff Reviews remain when it is not
- [x] URLs outside the allow list are refused; comments are the PR conversation thread only (no line/hunk comments)
- [x] Reviews refresh on list or connected Review open, on pull URL save, and about every 60 seconds while that page stays open; no webhooks; no full-repo scan while no client is looking
- [x] CI shows Actions runs plus commit statuses
- [x] Approve and request-changes call GitHub immediately; they are not Confirmations
- [x] Merge enqueues an Inbox Confirmation (kind distinct from reminder); the UI says the write appears as the PAT owner; merge uses the repository’s GitHub default method
- [x] Any member may confirm or dismiss; confirm performs the merge; dismiss does not execute; Confirmations fan out to every member, including those with no personal snapshot yet
- [x] Dismiss finishes a waiting LoopRun as `failed` (cancelled) when one is attached

## Answer

Landed on `feat/connected-workspace` as `98651a0`. Product code already matched; commit strengthens HTTP proofs for approve/request-changes, dismiss (no merge + failed LoopRun), Actions+commit-status CI, and conversation-only comments. Remaining gap: 60s/list/open polling cadence is renderer-only (spec forbids timer tests).

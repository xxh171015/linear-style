# Connected workspace

Status: ready-for-agent

Settled 2026-11-19. Vocabulary is in `GLOSSARY.md`. Outbound policy is ADR-0007 and ADR-0008.

## Problem Statement

Daily use still hits five gaps against the observed Linear loop: the packaged entry used to look wrong; Loops and Cycle rollover only moved while a renderer was open; Reviews were pasted diffs with a local merge button; Agent never called a model and Coding sessions never ran; Cycle length, Triage destinations and Issue Templates were hardcoded. Members need a connected Workspace that can talk to GitHub and a model after an explicit grant, without pretending those calls succeeded when nothing is connected.

## Solution

Keep IndexedDB offline mode local. After sign-in, the loopback account server owns secrets, Loop interval ticks, GitHub pulls, model replies and Coding session spawns. An Admin pastes Workspace-level Connections. Members use them; they never see the secret. GitHub writes appear as the PAT owner. A GitHub merge or Coding session waits in Inbox as a Confirmation until any member confirms or dismisses. Unconnected adapters stay `limited` (not connected), never a fake success. Teams configure Cycle length, Triage Accept/Decline plus Accept rotation, and Templates with a Team and required fields.

## User Stories

1. As a member opening the packaged app, I want install, test, typecheck, build and desktop package to succeed on the current scripts, so that I am not blocked by a broken entry or package config.
2. As a signed-out member, I want Agent, Reviews and Loops to stay on this device, so that nothing is sent until I sign in and an Admin connects an adapter.
3. As a signed-out member, I want Settings to say this device is offline, so that I do not look for GitHub or model fields that cannot work here.
4. As an Admin, I want to paste a fine-grained GitHub PAT and an allow list of `owner/repo` values, so that this Workspace can project pull requests.
5. As an Admin, I want to rotate or disconnect that GitHub Connection, so that a leaked or retired token stops being used.
6. As a member, I want to see that GitHub is connected and which repos are allowed, so that I know Reviews can sync, without seeing the token.
7. As a member, I want a GitHub URL outside the allow list to be refused, so that this Workspace cannot read or write an unlisted repository.
8. As a member, I want a Review with a github.com pull URL to become a projection of that pull request when GitHub is connected, so that title, diff, conversation comments and CI come from GitHub.
9. As a member, I want pasted-diff Reviews to remain when GitHub is not connected, so that local review notes still work.
10. As a member, I want Reviews to refresh when I open the list or a connected Review, when I save a pull URL, and about every 60 seconds while that page stays open, so that I am not depending on webhooks.
11. As a member, I want CI to show Actions runs plus commit statuses, so that I still see checks without a PAT Checks permission.
12. As a member, I want to Approve or request changes on a connected Review immediately, so that review of the PR is distinct from authorizing a merge.
13. As a member, I want Merge on a connected Review to enqueue an Inbox Confirmation instead of merging at once, so that a GitHub write needs an explicit confirm.
14. As a member, I want conversation comments on a connected Review to round-trip the PR thread, so that we can discuss the change without line comments.
15. As a member confirming a merge, I want the UI to say the write appears as the Workspace PAT owner, so that I do not think GitHub will attribute it to my personal account.
16. As any member, I want to confirm or dismiss a pending Confirmation, so that work is not stuck on the person who queued it.
17. As a member who dismisses a Confirmation, I want the waiting LoopRun to finish as `failed` with a cancelled result, so that it does not execute and does not look like success.
18. As a member who has never saved a private snapshot in this Workspace, I still want Confirmations fanned out to my Inbox, so that I am not dropped because I have not written yet.
19. As an Admin, I want to paste an OpenAI-compatible model base URL, API key and optional model name, so that Agent can infer over this Workspace.
20. As a member, I want Agent to call that model when it is connected, so that answers are not only the local assistant.
21. As a member, I want Agent to fall back to the local assistant when no model is connected (conflict / not connected), so that chat still works.
22. As a member, I want Agent to refuse to approve, merge or comment on GitHub itself, so that those writes only happen through Confirmation.
23. As a member, I want an Agent-proposed Coding session to appear as an Inbox Confirmation, so that a spawn does not start from chat alone.
24. As an Admin, I want to configure a Coding session as argv plus an absolute working directory, so that the account-server host can run a known command.
25. As a member confirming a Coding session, I want whole-argument tokens `{issueId}`, `{title}` and `{repoPath}` substituted, so that in-string interpolation cannot smuggle extra flags.
26. As a member, I want the child process to receive only PATH, HOME and LANG, so that Connection secrets are not copied into the spawn environment.
27. As a member, I want a Coding session to time out by 30 minutes, so that a hung tool cannot run forever.
28. As a member, I want a missing working directory or missing binary to fail the Coding session, so that a misconfigured Connection does not look completed.
29. As a member enabling a Loop whose action is a GitHub write or Coding session, I want a pending Confirmation instead of the Loop starting that work, so that Loops never mutate GitHub or spawn on their own.
30. As a member, I want `limited` on a LoopRun to mean the adapter is not connected, so that I do not read it as “waiting for confirm”.
31. As a member signed in, I want interval Loops (hourly, daily, weekly) to tick on the account server, so that they still run when my desktop is closed.
32. As a member signed in, I want the renderer to stop ticking Loops, so that hosted and local ticks do not double-run.
33. As a member signed out, I want Loops to tick only while this app is open, so that offline mode matches ADR-0005’s local schedule.
34. As a member, I want one run per Loop per interval period, so that opening the app twice in the same hour does not duplicate work.
35. As a member, I want a failed interval run to retry after five minutes, so that a blip is not skipped until the next period.
36. As a member, I want event-triggered Loops not to re-run the same Issue activity, so that a replay does not duplicate side effects.
37. As a member, I want assign, raise-priority and summarize Loops to run without a Confirmation, so that local Workspace edits are not blocked on Inbox.
38. As a member, I want Slack Loop actions to stay `limited`, so that we do not pretend to deliver Slack.
39. As a member clicking Run now while signed in, I want that run to happen on the account server, so that Coding Confirmations fan out to every member.
40. As a Team Admin, I want to set Cycle length in days (1–366, default 7), so that rollover matches how this Team works.
41. As a member, I want the account server to auto-create the next Cycle until one covers today, so that unfinished work has a successor to land on.
42. As a member, I want incomplete Issues (including In Review) on a completed Cycle to move to the immediate successor, oldest completed Cycle first, so that leftover work on older Cycles is not stranded.
43. As a member, I want done, canceled and duplicate Issues to stay on the completed Cycle, so that finished work does not roll.
44. As a Team Admin, I want to choose the Issue status for Triage Accept and Decline, so that Accept is not hardcoded to Backlog and Decline is not hardcoded to Canceled.
45. As a Team Admin, I want an Accept rotation of display names, so that accepted Issues round-robin assignees.
46. As a member accepting from Triage with an empty rotation, I want Accept to still apply the destination status, so that rotation is optional.
47. As a member, I want a Template to belong to one Team or to all Teams, so that the composer only offers Templates that apply here.
48. As a member, I want a Template to mark priority, assignee, Project or status as required, so that create is blocked until those fields are filled.
49. As a member applying a Template, I want the draft to remember which Template it came from, so that create can enforce that Template’s required fields.
50. As a member, I want reminders to remain an Inbox folder with snooze, so that a due date does not mutate Issues in the background.
51. As a desktop member with notifications enabled, I want an OS toast only while the desktop process is alive, so that we do not run a hidden reminder daemon.
52. As a member, I want Confirmation to be its own Inbox kind, so that it is not mixed up with a reminder.
53. As an Admin, I want Connection secrets to live only on the account server, so that a renderer or export cannot leak them.
54. As a member, I want GitHub mutations to use the repository’s default merge method, so that we do not invent a merge-queue policy.

## Implementation Decisions

- Two adapters at one policy seam: unconnected IndexedDB uses local Workspace commands and reports `limited`/`failed`; signed-in workspaces send outbound calls only after a Workspace Connection exists on the account server (ADR-0007).
- Connections are Workspace-level. Admin pastes and rotates secrets. HTTP status is redacted (`connected`, `repos`, `login`, `baseUrl`, `model`, `argv`, `cwd`). Members may call connected adapters; they cannot PUT or DELETE Connections.
- GitHub PAT is fine-grained: metadata read, contents read, pull requests write, commit statuses read, actions read. No Checks permission. Allowed `owner/repo` values live on the Connection. Merge uses GitHub’s default method. Actor is the PAT owner.
- GitHub is pulled, not pushed: fetch on Reviews list or connected Review open, on pull URL save, and about every 60 seconds while that page is open. No webhooks. No full-repo scan while no client is looking. Comments are the PR conversation thread only.
- Review identity for a projection is `owner/repo/number`. Interactive Approve and request-changes call GitHub immediately. Interactive Merge enqueues a Confirmation. Loop GitHub writes and Coding sessions always enqueue a Confirmation. Review approve is not a Confirmation.
- LoopRun statuses are `completed | limited | failed | pending`. `pending` means waiting on Confirmation. `limited` means not connected. Interval idempotency key is `{loopId, periodStart}`. Event idempotency key is `{loopId, issueId, activityId}`. Failed interval retry is five minutes. Dismiss sets the LoopRun to `failed` (cancelled) and does not execute.
- Confirmation is an Inbox kind. Shape:

```
ConfirmationAction = "coding-session" | "approve" | "request-changes" | "merge" | "comment"
InboxItem.kind = "reminder" | "confirmation"
InboxItem.confirmation = { action, issueId?, reviewId?, loopRunId?, body? }
```

- Confirmations fan out to every member’s personal Inbox, including members who do not yet have a personal row. Confirm or dismiss archives that item for all members.
- Agent uses OpenAI-compatible HTTP (`/v1/chat/completions`) plus API key. No model Connection → HTTP 409 with fallback to the local assistant. Agent may draft Issues/Projects and propose a Coding session; it must not approve, merge or comment on GitHub.
- Coding session: argv array, absolute cwd that must exist, 30 minute timeout, child env is PATH/HOME/LANG only. Whole-argument tokens `{issueId}` `{title}` `{repoPath}` only; in-string `{…}` is refused.
- Hosted Loop interval ticks and Run now run on the account server with `codingConfigured` true iff a coding Connection exists. The renderer skips `tick` when the repository can reserve Issue identifiers (hosted).
- Cycle incomplete means not done/canceled/duplicate (includes In Review). Auto-create adjacent Cycles until one covers today, then roll unfinished Issues from each completed Cycle onto the immediate successor (`endDate+1`).
- Team settings: `cycleDurationDays` (1–366, default 7), `triageAcceptStatus`, `triageDeclineStatus`, `triageRotation` (resets rotation index when the list is saved).
- Template: optional `teamKey`, optional `required` of `priority | assignee | project | status`. Create with a `templateId` fails until required fields are filled.
- Reminders stay Inbox snooze. No due-date job mutates Issues. Desktop OS toast only while the desktop process lives.

## Testing Decisions

A good test exercises the module interface: HTTP status and JSON for hosted behavior, Workspace command results for offline behavior. It does not read secret columns, scheduler timers, or React internals.

**Seam 1 — hosted account server.** Drive `createReplicaServer` the way existing account-server tests already do: register/join, cookie or Bearer, workspace header. Mock outbound `fetch` for GitHub and the model. Assert Connections redaction, Review projection and allow-list 403, merge enqueues Confirmation instead of PUT merge, confirm then performs merge, Coding Loop Run now fans out Confirmation and confirm runs argv, Agent 409 without a model, confirm/dismiss reach a member with no prior personal snapshot. Frozen-clock job entry (`tickWorkspaceRow`) is the same hosted module, used only for Cycle rollover and interval Loop idempotency that cannot wait on the 60s timer.

**Seam 2 — offline Workspace commands.** Drive public Workspace methods the way existing Workspace tests already do: `updateTeam` + `triage`, Template required fields, `tick` Cycle rollover and daily Loop once-per-period, `runLoop` with `codingConfigured` enqueuing Confirmation, `confirmInbox` / `dismissConfirmation`.

Do not add a third product seam. URL parse, repo allow-list and argv token rules already have small tests; keep them as they encode 400/403 messages the HTTP seam only sees as status codes. jsdom App tests may assert Settings/Inbox/Reviews copy and controls; they are not the source of domain truth.

## Out of Scope

Member IDs, email recovery, Insights, Customer Requests, per-team Issue status names, SSO/SCIM, Slack delivery, merge queues, line comments, velocity charts, recurring Issues, Project templates, document templates.

## Further Notes

P0 (frozen lockfile, test, typecheck, build, `desktop:package`) is a verification gate, not a product feature. Implementation of this spec landed in the same effort; treat regressions against these stories as in-scope. GitHub and model Connections were verified through server tests with mocked `fetch`; a live PAT/model grant still needs a human Admin paste.

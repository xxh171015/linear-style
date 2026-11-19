# 02: Configurable Cycles, Triage, and Templates

**What to build:** A Team Admin can set Cycle length, Triage Accept/Decline destinations plus Accept rotation, and Issue Templates with a Team and required fields. Offline `tick` and the account server use the same rules.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Team Cycle duration is 1–366 days (default 7); the account server auto-creates adjacent Cycles until one covers today
- [x] Incomplete Issues (including In Review) on a completed Cycle move to the immediate successor, oldest completed Cycle first; done, canceled, and duplicate stay put
- [x] Triage Accept and Decline write the Team’s configured Issue statuses; an Accept rotation of display names round-robins assignees and is optional
- [x] Saving the rotation list resets the rotation index
- [x] A Template may belong to one Team or all Teams; the composer only offers Templates that apply to the current Team
- [x] A Template may mark priority, assignee, Project, or status as required; create with that Template fails until those fields are filled
- [x] The same Cycle, Triage, and Template rules hold for an unconnected Workspace `tick` and for a signed-in workspace on the account server

## Answer

Landed on `feat/connected-workspace` as `f2f1ee9` (merge `254e1fc`). Public-seam tests cover every checkbox. Product change: `applyIssueTemplate` refuses a Team-scoped Template that does not apply to the current Team.

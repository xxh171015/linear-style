# 02: Configurable Cycles, Triage, and Templates

**What to build:** A Team Admin can set Cycle length, Triage Accept/Decline destinations plus Accept rotation, and Issue Templates with a Team and required fields. Offline `tick` and the account server use the same rules.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [ ] Team Cycle duration is 1–366 days (default 7); the account server auto-creates adjacent Cycles until one covers today
- [ ] Incomplete Issues (including In Review) on a completed Cycle move to the immediate successor, oldest completed Cycle first; done, canceled, and duplicate stay put
- [ ] Triage Accept and Decline write the Team’s configured Issue statuses; an Accept rotation of display names round-robins assignees and is optional
- [ ] Saving the rotation list resets the rotation index
- [ ] A Template may belong to one Team or all Teams; the composer only offers Templates that apply to the current Team
- [ ] A Template may mark priority, assignee, Project, or status as required; create with that Template fails until those fields are filled
- [ ] The same Cycle, Triage, and Template rules hold for an unconnected Workspace `tick` and for a signed-in workspace on the account server

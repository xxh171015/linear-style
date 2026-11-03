# Linear-style product

This replica is finding its way to Linear's Issue, Project, and Custom View product logic. Definitions here are the language we own, not a dump of Linear's schema.

## Language

**Issue**:
A unit of work identified by a human identifier (`{teamKey}-{number}`). It belongs to the ambient Team, may belong to one Project and one parent Issue, and may name a Milestone of that Project. Leaving the Project clears the Milestone. The same Issue is the same object from every list.
_Avoid_: Ticket, task

**Issue status**:
One of backlog, todo, progress, done, or canceled. Linear named workflow states of the same type collapse to one status. There is no triage status and no duplicate status.
_Avoid_: WorkflowState, state, status category

**Team**:
The home of Issues. This replica has one, treated as environment, not a thing the user switches.
_Avoid_: Workspace, organization (for this role)

**Workspace (Linear chrome)**:
The sidebar switcher and “Workspace” nav section label in the product shell. Linear UI chrome only—not a second org entity and not a synonym for Team in domain language.
_Avoid_: treating Workspace as the home of Issues; using Workspace in kernel/API names for Team

**Estimate**:
Optional size of an Issue in points. Absent means unestimated, not zero.

**Project**:
A named collection of Issues, identified by a slug, living in the ambient Team. It has a Project status, optional lead, optional dates, and ordered milestones. Any Issue in the ambient Team may belong to it.
_Avoid_: Board, epic

**Project status**:
One of backlog, planned, started, paused, completed, or canceled.
_Avoid_: ProjectStatus entity, workflow

**Project update**:
A dated health snapshot plus narrative for a Project. The Project's health is the health of its latest update, or none if it has never been updated.
_Avoid_: Status update, pulse

**Project health**:
One of onTrack, atRisk, or offTrack. It comes from a Project update, not from progress or Project status.
_Avoid_: Progress, status

**Milestone**:
An ordered checkpoint inside a Project, with a name and an optional target date. Its progress uses the same estimate-point rule as the Project.
_Avoid_: Phase, sprint, version

**Custom View**:
A named, shareable saved query over Issues, identified by a slug. It has a flattened membership filter plus grouping and layout of its own. Distinct from built-in lists such as My Issues and a Project's Issues tab.
_Avoid_: View (unqualified), saved search, View Preferences, FilterMatcher

**View filter**:
The Custom View's membership: an AND of the conditions that are set (assigned to me, created by me, subscribed, one-of statuses, a project, any-of labels, priority). Unset conditions do not constrain, so a filter with none set matches every Issue in the Team; priority No priority is a set condition, and only a missing priority is unset.
_Avoid_: CustomViewFilter (Linear's name for filtering the list of views), IssueFilter

**Built-in list**:
My Issues, Team Issues, or a Project's Issues tab. These are queries, not Custom Views. They may use the same grouping and layout words as a Custom View, but those settings are not saved as a Custom View.
_Avoid_: View, implicit view

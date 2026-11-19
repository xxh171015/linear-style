# Linear-style product

This local workspace follows the observed Linear interface and interactions. Reference observations and offline-only rules are distinguished in docs/research/linear-parity/README.md. ADR-0005 supersedes the earlier five-state and flat-query restrictions.

## Language

**Issue**:
A unit of work identified by a human identifier (`{teamKey}-{number}`). It belongs to the ambient Team, may belong to one Project and one parent Issue, and may name a Milestone of that Project. Leaving the Project clears the Milestone. The same Issue is the same object from every list.
_Avoid_: Ticket, task

**Issue status**:
A named state: backlog, todo, progress, review, done, canceled, duplicate, or triage. Categories are separate; progress and review are started, canceled and duplicate are canceled, and triage is its own category.
_Avoid_: WorkflowState, state, status category

**Team**:
The home of Issues. This replica has one, treated as environment, not a thing the user switches.
_Avoid_: Workspace, organization (for this role)

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
A named, locally shareable saved query over Issues or Projects. Its query is distinct from page-scoped display preferences. Legacy grouping/layout fields supply migration defaults. Built-in lists and Project membership remain separate queries.
_Avoid_: View (unqualified), saved search, View Preferences, FilterMatcher

**View filter**:
The Custom View's membership. Issue queries support independent AND/OR condition groups and text, ownership, status, Project, Cycle, label and priority conditions. Project queries use their own Project statuses, lead, text, labels and priority. An empty filter is unconstrained; priority 0 is a set condition.
_Avoid_: CustomViewFilter (Linear's name for filtering the list of views), IssueFilter

**Built-in list**:
My Issues, Team Issues, or a Project's Issues tab. These are queries, not Custom Views. They use separately persisted display preferences, without creating a Custom View record.
_Avoid_: View, implicit view


**Cycle**:
A dated team iteration, with its own identity and optional Issue membership. Completed/Current/Upcoming/Planned are date-based display phases. The local capacity rule is explicitly a local default.

**Initiative**:
A higher-level grouping of Projects. Local progress uses the unique linked Issues once. Original hosted health and progress aggregation remain unverified.

**Workspace**:
The single-user offline document containing canonical entities, files, drafts, queries and preferences. All screens subscribe to its snapshots.

**Loop**:
A saved trigger, action and scope with a run history. Local triggers run while the app is open. Prompt text is context; an external model is not implied.

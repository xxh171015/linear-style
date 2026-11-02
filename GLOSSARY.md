# Linear-style product

This replica is finding its way to Linear's Issue, Project, and Custom View product logic. Definitions here are the language we own, not a dump of Linear's schema.

## Language

**Issue**:
A unit of work that belongs to a Team and may belong to a Project.
_Avoid_: Ticket, task

**Project**:
A collection of Issues toward a shared outcome. It spans one or more Teams and has its own lifecycle status, estimate-based progress, and reported health.
_Avoid_: Board, epic, roadmap

**Project status**:
A named lifecycle position of a Project. Each status belongs to a type: backlog, planned, started, paused, completed, or canceled.
_Avoid_: State

**Project health**:
A reported signal — on track, at risk, or off track — taken from the most recent Project update. Distinct from Project status and from progress.
_Avoid_: Status (unqualified)

**Project update**:
A dated written report on a Project that records health at the time of posting.
_Avoid_: Status update (unqualified)

**Milestone**:
An ordered stage inside a single Project. An Issue in that Project may be assigned to at most one Milestone.
_Avoid_: Checkpoint, phase, sprint

**Project lead**:
The single User responsible for driving a Project and typically for posting its updates.
_Avoid_: Owner, project manager

**Custom View**:
A named, shareable saved query over a model (Issue, Project, Initiative, or FeedItem), carrying filter, grouping, and layout. Distinct from a one-off list such as My Issues.
_Avoid_: View (unqualified), saved search, filter

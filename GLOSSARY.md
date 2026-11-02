# Linear-style product

This replica is finding its way to Linear's Issue, Project, and Custom View product logic. Definitions here are the language we own, not a dump of Linear's schema.

## Language

**Issue**:
The core work item in Linear. It belongs to exactly one Team, occupies one WorkflowState of that team, and is referred to by a team-scoped Issue identifier.
_Avoid_: Ticket, task

**Issue identifier**:
The human-readable id of an Issue, formed from the Team's key and a number unique within that team (for example ENG-123). Distinct from the Issue's immutable id.
_Avoid_: Issue key, slug, shorthand id

**WorkflowState**:
A named, typed status in a Team's workflow (type is triage, backlog, unstarted, started, completed, canceled, or duplicate; name, color, and position are per team). An Issue occupies one WorkflowState, not a closed status enum.
_Avoid_: Status (unqualified), IssueStatus

**Team**:
The organizational unit that owns Issues and defines their workflow, identifier prefix, and team-scoped labels and estimates.
_Avoid_: Project, workspace

**Issue label**:
A named tag applicable to Issues, either across the workspace or scoped to a Team.
_Avoid_: Tag, category

**Sub-issue**:
An Issue that has a parent Issue. The parent-child tree is at most ten levels deep.
_Avoid_: Child task, nested ticket

**Project**:
A container of related Issues with its own status, progress, health, and milestones.
_Avoid_: Board, epic

**Custom View**:
A named, shareable saved query over a model (Issue, Project, Initiative, or FeedItem), carrying filter, grouping, and layout. Distinct from a one-off list such as My Issues.
_Avoid_: View (unqualified), saved search, filter

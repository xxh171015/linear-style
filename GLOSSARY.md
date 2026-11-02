# Linear-style product

This replica is finding its way to Linear's Issue, Project, and Custom View product logic. Definitions here are the language we own, not a dump of Linear's schema.

## Language

**Issue**:
A unit of work that belongs to a Team and may belong to a Project.
_Avoid_: Ticket, task

**Project**:
A container of related Issues with its own status, progress, health, and milestones.
_Avoid_: Board, epic

**Custom View**:
A named, shareable saved query over one View Model, owned by a user and optionally scoped to a Team or to the whole workspace. Distinct from a built-in list such as My Issues, and distinct from View Preferences.
_Avoid_: View (unqualified), saved search, filter, facet

**View Model**:
The entity kind a Custom View queries: Issue, Project, Initiative, or FeedItem. Which filter payload is set determines it; Issue is the default.
_Avoid_: modelName, View Type

**View Preferences**:
Layout, grouping, ordering, and display-property settings for a view. Workspace defaults merge with a user's overrides into the values that view actually shows.
_Avoid_: Display options, grouping, layout

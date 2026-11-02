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
A named, shareable saved query over one View Model, optionally scoped to a Team, a Project, or the whole workspace. Distinct from a built-in list such as My Issues, and distinct from View Preferences.
_Avoid_: View (unqualified), saved search, filter, facet

**View Model**:
The entity kind a Custom View queries: Issue, Project, Initiative, or FeedItem.
_Avoid_: modelName, View Type

**View Preferences**:
Layout, grouping, ordering, and display-property settings for a list. They attach to a Custom View or to a built-in page such as My Issues, not to the Issues or Projects being listed.
_Avoid_: Display options, grouping, layout

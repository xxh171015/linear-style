# Linear WorkflowState vs the replica's five statuses

Ticket: [How Linear workflow states relate to the replica's five statuses](https://github.com/xxh171015/linear-style/issues/8)
Map: [Spec Linear Issue, Project, and Custom View product logic](https://github.com/xxh171015/linear-style/issues/1)

Linear-as-it-is, then an explicit delta against this replica. A later grilling ticket decides which subset the replica keeps.

## Gist

Linear's issue status is a per-team **WorkflowState** entity: a named row with a **type** category. Type is one of seven strings (`triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`, `duplicate`). Name, color, and position are chosen per team; several named states can share one type. The replica's `IssueStatus` (`backlog`, `todo`, `progress`, `done`, `canceled`) is a **fusion** of Linear's default *names* and the five *user-creatable types*. `WORKFLOW_TYPE` is the type half of that fusion. Collapsing drops named-state multiplicity, triage (type + inbox), and duplicate (reserved closed type).

## Sources

Fetched 2026-11-02. Public schema and first-party docs; the Issue ticket's WorkflowState reconstruction was verified, not redone. Hosted-client REA was not required: product docs already state how the app presents named states versus types.

- GraphQL SDL: [`linear/linear` `packages/sdk/src/schema.graphql`](https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql) (`WorkflowState`, `WorkflowStateCreateInput` / `UpdateInput` / `Filter` / `Sort`, `Team.states`, `Team.defaultIssueState`, `Team.triageEnabled`, `Team.triageIssueState`, `Issue.state`, timestamps, `issueCreate` / `workflowState*` mutations). Same file the Issue ticket used.
- [Getting started (GraphQL)](https://linear.app/developers/graphql) — omitted `stateId` default; `workflowStates` as team status fields.
- [Filtering](https://linear.app/developers/filtering) — `state: { type: { eq: "started" } }`.
- [Agent interaction best practices](https://linear.app/developers/agent-best-practices) — first `started` state by lowest `position`.
- [Issue properties](https://linear.app/docs/issue-property) (same content as the Issue status / configuring-workflows page) — categories, default names, Make default, Duplicate reserved status, Triage as extra category.
- [Triage](https://linear.app/docs/triage) — inbox, who lands in Triage, accept/decline/duplicate, excluded from views.
- [Concepts](https://linear.app/docs/conceptual-model) — workflows as per-team ordered statuses; board columns and list groups are those statuses.
- [Team pages](https://linear.app/docs/default-team-pages) — Active = unstarted + started; Backlog = backlog type; cycle move → Todo.
- Prior tickets: [Reconstruct Linear's Issue model from the public GraphQL API](https://github.com/xxh171015/linear-style/issues/3) (`docs/research/issue-graphql-model.md`); [Locate Issue, Project, and Custom View logic in Linear.app](https://github.com/xxh171015/linear-style/issues/2).
- Replica: `src/types.ts` `IssueStatus`; `src/logic.ts` `STATUSES`, `STATUS_LABEL`, `WORKFLOW_TYPE`, `groupIssues`, `projectScope`, `nextStatus`.

Out of scope: copying Linear source; a logged-in session; deciding what the replica keeps.

## Mapping table

Linear `WorkflowState.type` is a `String!`, not a GraphQL enum. Values below are the documented set on `WorkflowState.type` and `WorkflowStateFilter.type`.

| Linear `type` | User-creatable? | Typical default name | Replica `IssueStatus` | Replica `WORKFLOW_TYPE` | Notes |
| --- | --- | --- | --- | --- | --- |
| `triage` | No | Triage | **none** | omitted | Type *and* product inbox. Create-input forbids this type. |
| `backlog` | Yes | Backlog | `backlog` | `backlog` | Product default for member-created issues (first Backlog named state). |
| `unstarted` | Yes | Todo | `todo` | `unstarted` | Replica key/label follow the *name* Todo, not the type name. |
| `started` | Yes | In Progress | `progress` | `started` | Replica key is `progress`; label is "In Progress". |
| `completed` | Yes | Done | `done` | `completed` | Replica key/label follow the *name* Done. |
| `canceled` | Yes | Canceled | `canceled` | `canceled` | Name and type coincide. |
| `duplicate` | No | Duplicate | **none** | omitted | Reserved system state. Closest collapsed bucket would be `canceled`; that is not Linear's model. |

Named states are many-to-one onto this table via `type`. Linear's own example ([issue-property](https://linear.app/docs/issue-property)):

| Type | Named states (Linear's product team) | Replica bucket if collapsed by type |
| --- | --- | --- |
| backlog | Icebox, Backlog | `backlog` |
| unstarted | Todo | `todo` |
| started | In Progress, In Review, Ready to Merge | `progress` |
| completed | Done | `done` |
| canceled | Canceled, Could not reproduce, Won't Fix | `canceled` |
| duplicate | Duplicate | dropped |
| triage | (when enabled) | dropped |

Default Linear workflow names (`Backlog > Todo > In Progress > Done > Canceled`) line up 1:1 with replica `STATUS_LABEL` when each type has exactly one named state.

## Observations

### WorkflowState is an entity, not an enum

Schema type comment: a state in a team's workflow, "representing an issue status such as Triage, Backlog, Todo, In Progress, In Review, Done, or Canceled." Each team has its own set. Fields that matter:

| Field | Role |
| --- | --- |
| `id` | Entity identity. `Issue.state` / create `stateId` point here. |
| `name` | Human label (examples in the schema: 'In Progress', 'Done', 'Backlog'). |
| `type` | Category string. Field comment: `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`, `duplicate`. The type-level comment omits `duplicate`; the field and filter comments include it. |
| `position` | Order **within the type group** (ascending). |
| `color` | HEX. |
| `description` | Optional. |
| `team` | Owning Team. Required. |
| `inheritedFrom` | Parent-team state if inherited; else null. |

`Issue.state: WorkflowState!`. There is no Issue-level status enum. The Issue ticket already recorded this; it still holds.

`WorkflowStateUpdateInput`: type cannot be changed after creation. Update may change name, color, description, position.

`WorkflowStateCreateInput.type`: "Valid values: backlog, unstarted, started, completed, canceled." **Not** `triage` or `duplicate`. Name, type, color, and team are required on create.

`workflowStateArchive`: "Only states with issues that have all been archived can be archived." The public schema has create, update, and archive — no delete mutation.

Product ([issue-property](https://linear.app/docs/issue-property)): add/edit/remove statuses in Team settings; at least one status must remain in each category; reorder within a category; **category order is fixed**.

`WorkflowStateSort.typeOnly`: sort by type without ordering named states inside the type. Product and schema both treat type as the category and name as the row.

### Two layers: type vs named state

**Type** is the category used for reporting, timestamps, progress, filters, and "closed":

- Filter example: `state: { type: { eq: "started" } }` ([filtering](https://linear.app/developers/filtering)).
- `Issue.startedAt` / `completedAt` / `canceledAt`: moved into started / completed / canceled **state** (type, not a specific name).
- `Issue.startedTriageAt` / `triagedAt`: entered / left triage.
- Project/cycle progress: completed estimate points + 0.25 × in-progress estimate points, over total. Schema `Project.currentProgress` is "broken down by issue status category." Replica `projectScope` uses `progress` and `done`, which match `started` and `completed` only after the fusion above.
- Auto-archive: "closed (completed, canceled, or duplicate)" (`TeamCreateInput.autoArchivePeriod`). Duplicate is a closed type, not a canceled named state.
- Agent guidance: if the issue is not `started` / `completed` / `canceled`, move it to the first `started` state (lowest `position`) ([agent-best-practices](https://linear.app/developers/agent-best-practices)).
- Team Active page: issues whose type is `unstarted` or `started`. Backlog page: `backlog` type. Cycle assignment moves backlog issues to "active (To do)" ([team pages](https://linear.app/docs/default-team-pages)).

**Named state** is what people see and what boards/lists group by:

- "These are the statuses that you'll see group issues on list views and show up as column headers on boards." ([concepts](https://linear.app/docs/conceptual-model))
- Several names per type are first-class (Icebox vs Backlog; In Review vs In Progress).
- Color and description are per named state.

The hosted app does **not** collapse types into five columns. It shows named states. Types are the fixed category rails those names sit on.

### Triage is a type, a named state, and an inbox

Three different things share the word:

1. **Type** `triage` — a WorkflowState category. Not creatable via `WorkflowStateCreateInput`. Schema type comment lists it with the other categories.
2. **Named state** — typically called "Triage". `Team.triageIssueState` is "the workflow state into which issues are set when they are opened by non-team members or integrations if triage is enabled."
3. **Inbox** — a team sidebar destination (`G` then `T`) outside the normal workflow. Toggle in Team Settings > Triage (`Team.triageEnabled`). Product: "Triage is an additional status category that acts as an Inbox for your team." ([issue-property](https://linear.app/docs/issue-property), [triage](https://linear.app/docs/triage))

Triage is **not** just another named state in Backlog. Issues in triage are excluded from views by default; include them with an explicit status filter that names Triage ([triage FAQ](https://linear.app/docs/triage)).

Accept (`1`) moves the issue to the team's **default status**. Decline (`2`) updates it to a **canceled** type. Mark as duplicate (`3` / `MM`) from the triage article says the issue is updated to a canceled type; the issue-properties article says it moves to the reserved Duplicate status (see Unknowns). Snooze hides it in the triage queue; `Issue.snoozedUntilAt` exists on the schema.

Agent best practices: if an automation delegated the agent, keep the issue in triage and leave assignment to a human.

Templates can override the triage status ([triage](https://linear.app/docs/triage)).

### Duplicate is a reserved type, not a canceled name

Product: marking an issue as a duplicate "automatically [moves] it into a reserved Duplicate status" that "cannot be renamed or customized" ([issue-property](https://linear.app/docs/issue-property)). Schema: `Team.markedAsDuplicateWorkflowState` is deprecated because "Duplicates are now system-managed via the native duplicate state."

Duplicate is its own `type`, listed beside canceled, and counted as closed for auto-archive. It is not a user-created canceled name like "Won't Fix".

### Default state on issue create

Three public stories, not fully aligned (the Issue ticket already flagged this; restated here because it is a workflow rule).

**Product UI** ([issue-property](https://linear.app/docs/issue-property)):

- Default status = the workflow status applied to newly created issues in the team; the creator can override it.
- Out of the box: first Backlog named state.
- "Make default" is offered on statuses in the **Backlog or Todo** categories only (types `backlog` and `unstarted`). Schema `Team.defaultIssueState` does not type-constrain that.

**Product triage** ([triage](https://linear.app/docs/triage)):

New issues default to Triage when they are created through an integration, created **inside the Triage view**, or created by a member **outside** that team. Default templates can override that.

**Public create API** ([getting started](https://linear.app/developers/graphql)):

If `issueCreate` omits `stateId`, the issue is assigned to the team's first Backlog-category state; if Triage is on for the team, it is assigned to the Triage workflow state.

**Schema field comments:**

- `Team.defaultIssueState`: default when issues are opened **by team members**.
- `Team.triageEnabled` / `triageIssueState`: when enabled, issues opened by **non-members or integrations** go to the triage state.

Treat the getting-started paragraph as the coarse public API rule, the Team fields as the member vs non-member split, and the product UI as who may be marked default (backlog/unstarted only). They do not fully agree (Unknowns).

Replica composer defaults `draftStatus` to `"backlog"`, which matches the product's out-of-the-box member default and ignores triage.

### Replica `IssueStatus` and `WORKFLOW_TYPE`

```ts
type IssueStatus = "backlog" | "todo" | "progress" | "done" | "canceled";

WORKFLOW_TYPE = {
  backlog: "backlog",
  todo: "unstarted",
  progress: "started",
  done: "completed",
  canceled: "canceled",
}
```

`STATUS_LABEL` is the default Linear *names* (Backlog, Todo, In Progress, Done, Canceled). `WORKFLOW_TYPE` is the five *user-creatable types*. The replica keys mix both vocabularies: `backlog`/`canceled` match type names; `todo`/`progress`/`done` match (or abbreviate) default names.

The type comment on `IssueStatus` already says this: "Linear workflow state types, collapsed to the replica's five statuses."

Uses in the replica:

- `groupIssues(..., "status")` builds **five** groups from `STATUSES`, labeled with default names. Linear groups by **named state** (so "In Review" is its own column).
- `projectScope` treats `canceled` as out of scope, `progress` as the 0.25 in-progress term, `done` as completed. Linear's formula is by **type** (`started` / `completed`), so every started named state counts as in-progress.
- `nextStatus` cycles the five values as a ring. Linear has no such ring; type order is fixed and names are not a cycle.
- Custom View `filter.statuses` is a list of `IssueStatus`. Linear filters by WorkflowState id, name, or type.
- Keyboard `1`–`5` picks among the five. Linear's picker is the team's named states.
- `showCompleted` hides `done` and `canceled`. Linear's Active page is the inverse filter on types (`unstarted` | `started`), and also excludes backlog, completed, canceled, triage, and duplicate.

## Inferences

- Replica `IssueStatus` is not Linear's `WorkflowState.type` and not Linear's `WorkflowState.name`. It is those two layers fused at Linear's **default** workflow (one name per user-creatable type).
- `WORKFLOW_TYPE` exists because the replica keys are not type names. Progress math and any future type-based rule have to map `todo`→`unstarted`, `progress`→`started`, `done`→`completed`.
- `triage` and `duplicate` are system categories: readable on `type`, absent from create-input, special-cased in product (inbox; reserved Duplicate state). The Issue ticket's inference still holds.
- "First state in the Backlog category" means: that team's WorkflowStates with `type: "backlog"`, lowest `position`. Same pattern as "first started state" in the agent docs.
- Product "Make default" limited to Backlog/Todo is a UI constraint on `defaultIssueState`; the schema field is an unconstrained `WorkflowState`.
- Board/list grouping in Linear is by named state, not by type. The replica's five status groups are a type-level (and default-name-level) collapse the hosted app does not perform.

## What collapsing to five values loses

Not an adoption decision — the cost of the fusion.

1. **Named-state multiplicity.** Icebox vs Backlog, In Review vs In Progress vs Ready to Merge, Won't Fix vs Canceled all become one bucket. Board columns and list groups that Linear shows as separate statuses disappear.
2. **Per-team names, colors, descriptions, positions.** ENG's "In Review" and Design's "Doing" cannot both exist; inheritance from a parent team (`inheritedFrom`) has nowhere to go.
3. **Entity identity.** Linear issues point at a WorkflowState `id`. The replica stores an enum. You cannot address "this team's In Review" vs "this team's In Progress".
4. **Triage.** The type, the named state, the inbox, the member/non-member routing, exclusion from views, accept→default / decline→canceled, snooze, and triage timestamps are all absent. Incoming work lands in `backlog` (or whatever the replica composer used).
5. **Duplicate.** A distinct closed type and reserved state. Collapsing it into `canceled` mixes "we will not do this" with "this is the same as another issue." Omitting it loses duplicate as an outcome.
6. **Default-state choice.** Linear can default to a specific Backlog *or* Todo named state. The replica always starts from the `backlog` key.
7. **Type-based vs name-based queries.** Linear filters `state.type` (all started names at once) or a specific state. The replica can only filter the five keys, which is neither (it is both, fused).
8. **Active / Backlog team pages.** Active = unstarted+started types. Replica has no type-level Active; `todo` and `progress` are just two of five statuses.
9. **Closed-set operations.** Auto-archive treats completed, canceled, **and duplicate** as closed. Replica `showCompleted` is done+canceled only.
10. **Progress granularity.** Linear counts every `started` named state as in-progress (¼). The replica can only count `progress`. That matches iff there is one started name.
11. **Workflow as a ring.** `nextStatus` invents a cycle Linear does not have (and would walk Done → Canceled → Backlog).
12. **System vs user states.** Users cannot create triage/duplicate types, cannot rename Duplicate, cannot change a state's type after create, cannot remove the last state in a category. The replica's five values are all equally user-toggleable.

## Delta vs replica (informational)

| Linear | Replica |
| --- | --- |
| `Issue.state: WorkflowState!` (per-team entity) | `Issue.status: IssueStatus` (five keys) |
| Seven types, five of them user-creatable | Five keys; `WORKFLOW_TYPE` covers the five creatable types |
| Many named states per type | One key per type, labeled with the default name |
| Grouping/columns = named states | Grouping = the five keys |
| Triage type + inbox | Absent; composer defaults to `backlog` |
| Duplicate reserved type | Absent |
| Default = first backlog name, or a chosen backlog/unstarted name; triage path for non-members/integrations | Always `backlog` unless the user picks another of the five |
| Filter by state id / name / type | Filter by `IssueStatus` |
| `next` status is not a ring | `nextStatus` cycles five values |
| Progress by type (`started` / `completed`) | Progress by `progress` / `done` (same after fusion) |

## Unknowns

- Create without `stateId` when Triage is on: always Triage (getting-started), only non-members/integrations (`triageIssueState`), or the product mix (integrations + foreign members + Triage view)? Unresolved since the Issue ticket.
- Whether API `defaultIssueState` can be a `started`/`completed`/`canceled` state even though the UI only offers Backlog/Todo.
- Whether a team may have zero or many WorkflowStates of type `triage` / `duplicate`, or exactly one each. Product copy talks as if each is singular.
- Triage "mark as duplicate": issue-properties says reserved Duplicate status; triage docs say "Canceled status type." Schema deprecates a custom marked-as-duplicate state in favor of the native duplicate state. Likely Duplicate type; the triage sentence may be stale.
- Whether product "remove status" is `workflowStateArchive` or an undocumented delete. Public schema only archives.
- Exact hosted-app picker/grouping implementation (named-state columns are documented; this session did not REA `https://linear.app` JS). No logged-in session.
- Whether `Project.progress`'s "in progress" bucket is strictly `type: started`, or also includes other types. Schema says "issue status category"; product graph copy says in-progress.
- Linear importer helper type `IssueStatus = "backlog" | "unstarted" | "started" | "completed" | "canceled"` (SDK autodocs) is a **type-name** five-set, not this replica's name-based five. Not used as an authority for the replica.

## Coverage

- Public schema WorkflowState / Team default / Issue.state: verified against the Issue ticket; extra fields used here (`inheritedFrom`, create-input types, archive, `WorkflowStateSort`, auto-archive closed set).
- Product status, triage, concepts, team pages: fetched.
- Replica `IssueStatus` / `WORKFLOW_TYPE` / grouping / progress / composer default: read from this worktree.
- Hosted client JS: not traced. Product docs already separate named-state presentation from type categories.

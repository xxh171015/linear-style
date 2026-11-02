# Linear Issue from the public GraphQL API

What Linear's Issue is, as specified by the public GraphQL schema and developer docs — not by this replica.

This file is Linear-as-it-is. The replica delta at the end is informational only. A later grilling ticket decides which subset this replica keeps.

## Sources

Fetched 2026-11-02.

- GraphQL SDL: [`linear/linear` `packages/sdk/src/schema.graphql`](https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql) (`type Issue`, `IssueCreateInput`, `IssueUpdateInput`, `WorkflowState`, `Team`, `IssueLabel`, related mutations).
- Developer getting started: [https://linear.app/developers/graphql](https://linear.app/developers/graphql) (same page as [https://linear.app/developers/graphql.md](https://linear.app/developers/graphql.md)).
- Developer filtering: [https://linear.app/developers/filtering](https://linear.app/developers/filtering).
- Developer SDK mutations: [https://linear.app/developers/sdk-fetching-and-modifying-data](https://linear.app/developers/sdk-fetching-and-modifying-data).
- Developer URL prefill (not the GraphQL mutation): [https://linear.app/developers/create-issues-using-linear-new](https://linear.app/developers/create-issues-using-linear-new).
- Developer portal: [https://developers.linear.app/](https://developers.linear.app/) lists GraphQL API and “Create issues via URL”; its inner GraphQL pages did not add Issue-model prose beyond the `linear.app/developers` pages above.

Out of scope here: REA of Linear.app, replica adoption, specifying Cycle / Inbox / Agent.

## Gist

An Issue is Linear's core work item. It belongs to exactly one Team, occupies one WorkflowState of that team (a named, typed status — not a closed status enum), and is identified three ways: a stable UUID (`id`), a team-scoped integer (`number`), and a human identifier (`identifier`, `{team.key}-{number}`, e.g. `ENG-123`). Assignee, labels, estimate, parent, project, and cycle are optional edges. Create requires a team; a title unless a template supplies one; omitted `stateId` is documented as the team's first Backlog-category state, or the Triage state when Triage is on. Property edits in the first three minutes are not activity-log changes.

## Observations

### Identity

From `type Issue` in the schema:

- `id: ID!` — “The unique identifier of the entity.” `IssueCreateInput.id` is optional and, if sent, must be UUID v4; otherwise the backend generates one.
- `identifier: String!` — “Issue's human readable identifier (e.g. ENG-123).”
- `number: Float!` — “The issue's unique number, scoped to the issue's team. Together with the team key, this forms the issue's human-readable identifier (e.g., ENG-123).” (GraphQL `Float` here is the usual stand-in for a large integer.)
- `previousIdentifiers: [String!]!` — “Previous identifiers of the issue if it has been moved between teams.”
- `url: String!` — “Issue URL.”
- `team: Team!`, and `Team.key: String!` — “The team's unique key, used as a prefix in issue identifiers (e.g., 'ENG' in 'ENG-123') and in URLs.”

From [Getting started](https://linear.app/developers/graphql):

- `query Issue { issue(id: "BLA-123") { id title description } }` looks up by the human identifier.
- `issueUpdate` “`id` provided can be either be the uuid returned by the creation query, or the shorthand id like `BLA-123`.”
- Command menu “Copy model UUID” is how you copy the UUID from the app.

From the schema `Query.issue(id: String!)`: “One specific issue, looked up by its unique identifier.” `IssueCreateInput.parentId` / `IssueUpdateInput.parentId`: “Can be a UUID or issue identifier (e.g., 'LIN-123').” Same wording on `IssueRelationCreateInput.issueId` / `relatedIssueId`.

`id` is the immutable entity id. `identifier` is the product-facing id and is accepted in several API id slots. `number` is the team-scoped sequence piece of `identifier`. Moving teams preserves history of old identifiers on `previousIdentifiers`.

### Required Team

Schema `type Issue`: “The team that the issue belongs to. Every issue must belong to exactly one team, which determines the available workflow states, labels, and other team-specific configuration.” Field: `team: Team!`.

`IssueCreateInput`: “At minimum, a team must be specified.” Field `teamId: String!` is the only non-null field on that input.

[Getting started](https://linear.app/developers/graphql): “As issues (and most other objects) are team based, you first need to get the ID of the team you want to interact with.” The `issueCreate` example sends `teamId` and `title`. The SDK example is the same pair (`createIssue({ teamId, title })`) on [Fetching & modifying data](https://linear.app/developers/sdk-fetching-and-modifying-data).

`IssueUpdateInput.teamId: String` is optional — the team can change after create (see `previousIdentifiers`).

Schema `type Team`: “A team is the primary organizational unit in Linear. Issues belong to teams, and each team has its own workflow states, cycles, labels, and settings.”

### WorkflowState, not a status enum

Schema `type Issue`: “An issue is the core work item in Linear. Issues belong to a team, have a workflow status…” Field `state: WorkflowState!` — “The workflow state (issue status) that the issue is currently in. Workflow states represent the issue's progress through the team's workflow, such as Triage, Todo, In Progress, Done, or Canceled.”

There is no Issue-level status enum. Status is a per-team `WorkflowState` entity.

Schema `type WorkflowState`: “A state in a team's workflow, representing an issue status such as Triage, Backlog, Todo, In Progress, In Review, Done, or Canceled. Each team has its own set of workflow states… Workflow states have a type that categorizes them (triage, backlog, unstarted, started, completed, canceled), a position that determines their display order, and a color for visual identification. States can be inherited from parent teams to sub-teams.”

- `id: ID!`, `name: String!` (e.g. 'In Progress', 'Done', 'Backlog'), `type: String!`, `position: Float!`, `color: String!`, `team: Team!`.
- Field `type` comment: “One of "triage", "backlog", "unstarted", "started", "completed", "canceled", "duplicate".”
- `WorkflowStateCreateInput.type`: “Valid values: backlog, unstarted, started, completed, canceled.” Create-input does not list `triage` or `duplicate`.

`IssueCreateInput.stateId` / `IssueUpdateInput.stateId`: “The team state of the issue.” Optional on both inputs.

[Getting started](https://linear.app/developers/graphql) calls `stateId` “the status field for the issue”, queries `workflowStates` as “status fields for teams”, and updates via `stateId` then reads `issue { state { id name } }`.

[Filtering](https://linear.app/developers/filtering) filters by `state: { type: { eq: "started" } }`, i.e. by WorkflowState type, not by a name enum.

Related timestamps on `Issue`: `startedAt` (“moved into started state”), `completedAt` (“moved into completed state”), `canceledAt` (“moved into canceled state”), `startedTriageAt` (“entered triage”), `triagedAt` (“left triage”).

### Assignee

`Issue.assignee: User` — “The user to whom the issue is assigned. Null if the issue is unassigned.”

`IssueCreateInput.assigneeId` / `IssueUpdateInput.assigneeId`: “The identifier of the user to assign the issue to.” `IssueUpdateInput` says “Setting a field to null (where supported) will clear the value.”

[Getting started](https://linear.app/developers/graphql) reads `assignee { id name }` on team issues and `User.assignedIssues` for “all the issues assigned to a user.”

Assignee is a single optional User. Unassigned is null. (Schema also has `delegate: User` for an agent user; Agent is out of scope here.)

### Labels

`Issue.labels` is an `IssueLabelConnection`. `Issue.labelIds: [String!]!` — “Identifiers of the labels associated with this issue.”

Create: `IssueCreateInput.labelIds`. Update: `labelIds`, plus incremental `addedLabelIds` / `removedLabelIds`. Mutation `issueAddLabel(id, labelId)` exists.

Schema `type IssueLabel`: “Labels that can be associated with issues… workspace-level (shared across all teams) or team-scoped… organized hierarchically into groups, where a parent label acts as a group containing child labels.” `team: Team` — “If null, the label is a workspace-level label available to all teams in the workspace.” `isGroup: Boolean!` — group labels “cannot be directly applied to issues or projects.”

[Filtering](https://linear.app/developers/filtering) matches issues by `labels: { name: { eq: "Bug" } }` (at least one matching label) or `labels: { every: { … } }`.

[Create issues using linear.new](https://linear.app/developers/create-issues-using-linear-new): URL `label` / `labels`; “If the label doesn't exist in the workspace, it will be ignored.”

Labels are IssueLabel entities (id + name + color + optional team), not free-string tags. Groups are not themselves applied.

### Estimate

`Issue.estimate: Float` — “The estimate of the complexity of the issue. The specific scale used depends on the team's estimation configuration (e.g., points, T-shirt sizes). Null if no estimate has been set.”

Create/update take `estimate: Int`.

On `Team`:

- `issueEstimationType: String!` — “Must be one of "notUsed", "exponential", "fibonacci", "linear", "tShirt".”
- `issueEstimationAllowZero: Boolean!`, `issueEstimationExtended: Boolean!`
- `defaultIssueEstimate: Float!` — “What to use as a default estimate for unestimated issues.”

[Filtering](https://linear.app/developers/filtering) example “started issues … that don't have an estimate” uses `estimate: { eq: 0 }` (not `null: true`).

[Create issues using linear.new](https://linear.app/developers/create-issues-using-linear-new): estimate applies only when the team has estimates enabled; T-shirt point values listed as XS 1, S 2, M 3, L 5, XL 8, XXL 13, XXXL 21 (that page labels 0 as “No priority”, which is priority wording on an estimate table).

Estimate is optional numeric complexity. The scale is a Team setting. Schema treats unset as null; the filtering doc treats 0 as unestimated.

### Parent and sub-issues

Schema `type Issue` description: “Issues support sub-issues (parent-child hierarchy up to 10 levels deep)…”

- `parent: Issue` — “The parent of the issue.” Null if none.
- `children: IssueConnection` — “Children of the issue.”
- `subIssueSortOrder: Float` — “The order of the item in the sub-issue list. Only set if the issue has a parent.”
- Create/update `parentId: String` — UUID or issue identifier.

`issueDelete`: “Deletes (trashes) an issue and its sub-issues.” `issueArchive` has `trash: Boolean` — “Whether to trash the issue and its sub-issues.”

Team settings: `autoCloseChildIssues` — “Whether child issues should automatically close when their parent issue is closed”; `autoCloseParentIssues` — “Whether parent issues should automatically close when all child issues are closed.” `IssueUpdateInput.autoClosedByParentClosing` exists on the write input only.

Parent/child is a tree of Issues, depth capped at 10 in the schema description, with optional auto-close on the Team.

### Project membership

`Issue.project: Project` — “The project that the issue is associated with. Null if the issue is not part of any project.” `Issue.projectMilestone: ProjectMilestone` — null if not assigned to a milestone. `addedToProjectAt: DateTime`.

Create/update `projectId: String` — “Can be a UUID or project identifier (e.g., 'P-LIN-123').” `projectMilestoneId: String`.

An Issue belongs to at most one Project. Membership is an optional edge, not identity. (Project itself is not specified in this ticket.)

### Cycle membership (edge only)

`Issue.cycle: Cycle` — “The cycle that the issue is associated with. Null if the issue is not part of any cycle.” `addedToCycleAt: DateTime`. Create/update `cycleId: String` — “The cycle associated with the issue.”

Team flags that write this edge without specifying Cycle: `cyclesEnabled`, `cycleIssueAutoAssignStarted` (“Auto assign started issues to current cycle”), `cycleIssueAutoAssignCompleted` (“Auto assign completed issues to current cycle”).

[Create issues using linear.new](https://linear.app/developers/create-issues-using-linear-new): cycle prefill “Applicable only when the targeted team has cycles feature enabled.”

Cycle membership is an optional edge on Issue. Cycle as an entity is not specified here.

### Create and update invariants

Documented on `IssueCreateInput`: “At minimum, a team must be specified. A title is required unless a template is provided. All other fields are optional and will use defaults from the team or template if not specified.” `templateId` “If other values are provided in the input, they will override template values.” `useDefaultTemplate: Boolean` applies the team's default template for the user's membership.

On the persisted `Issue`, `title: String!` is non-null. On the create input, `title: String` is GraphQL-optional (the requirement lives in the description, plus the template exception).

Default WorkflowState when `stateId` is omitted, from [Getting started](https://linear.app/developers/graphql):

> If an issue is created without a specified `stateId` (the status field for the issue), the issue will be assigned to the team's first state in the Backlog workflow state category. If the "Triage" feature is turned on for the team, then the issue will be assigned to the Triage workflow state.

Schema Team fields that speak to the same moment:

- `defaultIssueState: WorkflowState` — “The default workflow state into which issues are set when they are opened by team members.”
- `triageEnabled: Boolean!` — “When enabled, issues created by non-members or integrations are routed to a triage state for review before entering the normal workflow.”
- `triageIssueState: WorkflowState` — “The workflow state into which issues are set when they are opened by non-team members or integrations if triage is enabled.”

`IssueCreateInput.completedAt` “Cannot be provided with an incompatible workflow state.” `createdAt` if omitted: “the backend will generate the time as now.”

`IssueUpdateInput`: “All fields are optional; only provided fields will be updated. Setting a field to null (where supported) will clear the value.”

Activity-log quiet period, from [Getting started](https://linear.app/developers/graphql):

> Changes made to an issue's properties in the first 3 minutes are considered part of the issue creation process, and won't be added to the activity log as changes to the issue.

The schema exposes that log as `Issue.history: IssueHistoryConnection` (“History entries associated with the issue”). It does not mention the three-minute window.

Priority on Issue is documented as `0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low` (`Issue.priority: Float!`, same integers on create/update). Adjacent, not a focus of this ticket.

## Inferences

- `identifier` is `{Team.key}-{Issue.number}` at a point in time. After a team move the live `identifier` changes and the old value remains in `previousIdentifiers`.
- `triage` and `duplicate` WorkflowState types are system categories: they appear on `WorkflowState.type` but not on `WorkflowStateCreateInput.type`.
- “First state in the Backlog workflow state category” means: among that team's `WorkflowState`s with `type: "backlog"`, the one with lowest `position`. Whether that object is always `Team.defaultIssueState` is not stated (see Unknowns).
- The getting-started Triage default and the schema's member vs non-member split are both about omitted `stateId`; they do not fully agree (see Unknowns). Treat the getting-started paragraph as the public create-API rule, and the Team fields as the finer membership split, until a later ticket resolves them.
- Filtering's `estimate: { eq: 0 }` for “don't have an estimate” implies some unestimated issues are stored as 0 rather than (or as well as) null.

## Unknowns

- Whether `issueCreate` without `stateId` always uses “first Backlog-category state”, always uses `Team.defaultIssueState`, or uses defaultIssueState for members and triageIssueState for non-members/integrations when `triageEnabled`. The getting-started note and the Team field comments conflict on who gets Triage.
- Whether `number` is reused or reissued when an Issue moves team.
- Whether parent and child may be on different teams; whether `project` / `cycle` may be entities that do not include the Issue's Team. Schema does not say.
- Whether depth-10 is enforced by the API, only the product UI, or both.
- Exact quiet-period clock: start (`createdAt` vs first write), which properties, whether comments count, timezone.
- Whether omitted `title` without a template is rejected at runtime (documented required) or only invalid after persistence (`Issue.title` is non-null).
- `autoClosedByParentClosing` is on `IssueUpdateInput` only; how it is recorded on `Issue` / `IssueHistory` is not described on `type Issue`.
- `developers.linear.app` inner GraphQL routes did not yield additional Issue-model text in this fetch; unknown whether any Issue page there exists beyond the `linear.app/developers` mirror.

## Invariants

1. An Issue belongs to exactly one Team (`team: Team!`; create `teamId: String!`).
2. An Issue occupies exactly one WorkflowState (`state: WorkflowState!`). Status is not a closed enum on Issue.
3. Identity is three public fields: `id` (UUID), `number` (unique within the team), `identifier` (human, `{team.key}-{number}`). Several mutations/queries accept UUID or identifier.
4. Create requires a team; requires a title unless a template is provided.
5. Omitted `stateId` on create: team's first Backlog-category WorkflowState, unless the team's Triage feature is on, in which case the Triage WorkflowState (getting-started rule).
6. Assignee is at most one User; null means unassigned.
7. Labels are IssueLabel entities, workspace- or team-scoped; group labels are not applied directly.
8. Estimate is optional numeric complexity; the scale is the Team's `issueEstimationType`. Unset is null on `Issue.estimate`.
9. Parent/child is a tree of Issues, described as at most 10 levels. Deleting/trashing a parent includes sub-issues.
10. Project membership and cycle membership are optional many-to-one edges (`project` / `cycle` nullable).
11. Property changes in the first 3 minutes after create are not activity-log changes.
12. Update is a patch: only provided fields change; null clears where supported.

## Delta vs replica `src/types.ts` Issue (informational)

Do not treat this list as an adoption decision.

| Linear (public API) | Replica `Issue` |
| --- | --- |
| `id` UUID + `identifier` + `number` + `previousIdentifiers` | single `id: string` |
| `team: Team!` / `teamId` required | `teamKey: string` (key only, no Team entity) |
| `state: WorkflowState!` (per-team named states; types include triage and duplicate) | `status: IssueStatus` closed set `backlog \| todo \| progress \| done \| canceled`. `WORKFLOW_TYPE` in `src/logic.ts` maps those five to backlog/unstarted/started/completed/canceled and omits triage and duplicate |
| `assignee: User` (optional) | `assigned: boolean` plus optional display-name `assignee?: string` |
| `creator: User`, `subscribers` connection | viewer-relative flags `created` / `subscribed` |
| `labels` / `labelIds` of `IssueLabel` | `labels: string[]` (names) |
| `estimate: Float` nullable; team scale | `estimate?: number`; no scale, no null-vs-0 story |
| `parent` + `children` + `subIssueSortOrder`; depth 10 | `parentId?: string`; no children, no depth rule |
| `project: Project` / `projectMilestone` optional | `projectId?` / `milestoneId?` (same shape of edge) |
| `cycle: Cycle` optional edge | `cycleId?` (same shape of edge) |
| `title` required unless template; `description` markdown | `title: string`; `body: string` |
| `createdAt` / `updatedAt` / `completedAt` / `canceledAt` / `startedAt` / triage timestamps | single `date: string` |
| activity history + 3-minute quiet period | no activity log |
| create default Backlog vs Triage | no create-default state rule |
| `priority` 0–4 | `priority` 0–4 (matches) |

Replica `IssueStatus` is a collapsed view of `WorkflowState.type`, not Linear's Issue status model.

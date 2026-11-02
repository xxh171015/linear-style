# Linear Project model (public GraphQL)

What Linear's **Project** is, as specified by the public GraphQL schema and first-party docs — not by this replica.

Initiative membership is an edge only. This file does not specify Initiative or Cycle as destinations. Replica adoption is out of scope; the replica delta is informational.

## Sources

Fetched 2026-11-02.

| Source | Role |
| --- | --- |
| [linear/linear `packages/sdk/src/schema.graphql`](https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql) (`master`) | Owning source for types, fields, inputs, enums, and field comments |
| [Getting started (GraphQL)](https://linear.app/developers/graphql) | Endpoint, auth, pagination/archive defaults, SDK pointer. No Project-specific model |
| [developers.linear.app](https://developers.linear.app/) | Hub that points at the same GraphQL/SDK docs. No extra Project model text |
| [SDK fetching & modifying data](https://linear.app/developers/sdk-fetching-and-modifying-data) | `projects()` is a paginated connection; `archiveProject` exists |
| [Filtering](https://linear.app/developers/filtering) | Nested `projects` / `project` filters; one example still filters `project.state` |
| [Webhooks](https://linear.app/developers/webhooks) | Data-change events for `Projects` and `Project updates` |
| [Concepts](https://linear.app/docs/conceptual-model) | Product meaning of Project vs Issue vs Team vs Milestone |
| [Projects](https://linear.app/docs/projects) | Create/delete, multi-team, dates, issue membership |
| [Project status](https://linear.app/docs/project-status) | Status types, lead-team scoping, custom names |
| [Project milestones](https://linear.app/docs/project-milestones) | Milestone ownership, derived focus, progress wording |
| [Initiative and project updates](https://linear.app/docs/initiative-and-project-updates) | Health vs updates vs staleness |
| [Project graph](https://linear.app/docs/project-graph) | Scope/progress graph, ¼ in-progress modifier, unestimated = 1 |
| [Project priority](https://linear.app/docs/project-priority) | Priority labels matching schema integers |
| [Project labels](https://linear.app/docs/project-labels) | Workspace vs team labels |
| [Project templates](https://linear.app/docs/project-templates) | Create-time template application |

Schema field comments are quoted as schema text. Do not treat replica `src/` as a source.

## Observations

### What a Project is

The schema type comment: "A project is a collection of issues working toward a shared goal. Projects have start and target dates, milestones, status tracking, and progress metrics. They can span multiple teams and be grouped under initiatives." (`type Project`)

Product concepts: "Projects group issues together around a shared outcome." ([conceptual-model](https://linear.app/docs/conceptual-model))

Product projects page: a Project is "a grouping of issues that have a clear outcome or planned completion date"; it can be shared across multiple teams; human-readable ID is `P-TEAM-123`. ([projects](https://linear.app/docs/projects))

Public reads: `Query.project(id)` ("identifier or URL slug"); `Query.projects` ("all projects in the workspace, with optional filtering and sorting"). Archived projects are omitted unless `includeArchived: true` ([Getting started — Archived resources](https://linear.app/developers/graphql); `projects(includeArchived:)`).

### Identity and copy

| Field | Schema |
| --- | --- |
| `id` | `ID!` |
| `slugId` | `String!` — "unique URL slug" |
| `url` | `String!` — "Project URL" |
| `name` | `String!` |
| `description` | `String!` — "short description" |
| `content` | `String` — "content in markdown format" |
| `color` | `String!` HEX |
| `icon` | `String` |
| `identifier` | `String` **[Internal]** — custom override or a default identifier; "Null for projects without a lead team and for legacy projects that have not been backfilled." The comment's default-format tokens were stripped in the published SDL (`P- - `). Product docs give `P-TEAM-123`. ([projects](https://linear.app/docs/projects)) |
| `previousIdentifiers` | `[String!]!` **[Internal]** |

`projectCreate` / `projectUpdate` / `projectDelete` / `projectUnarchive` accept "the identifier of the project" and, for update/unarchive, "Also the identifier from the URL is accepted." `ProjectMilestoneCreateInput.projectId` and `ProjectUpdateCreateInput.projectId` accept "a UUID or project identifier (e.g., 'P-LIN-123')". `IssueCreateInput.projectId` same.

### Status and timestamps

`Project.status` is a `ProjectStatus!` entity, not a string enum. The field comment: "Defines the project's position in its lifecycle (e.g., backlog, planned, started, paused, completed, canceled)."

`Project.state: String!` is **deprecated**: "Use project.status instead."

`type ProjectStatus`: "A custom project status within a workspace. Statuses are grouped by type (backlog, planned, started, paused, completed, canceled)…"

```
enum ProjectStatusType {
  backlog
  canceled
  completed
  paused
  planned
  started
}
```

`ProjectStatus` fields that matter: `name`, `type`, `color`, `description`, `position`, `indefinite` ("Whether a project can remain in this status indefinitely. When false, projects in this status may trigger reminders or auto-archiving after a period of inactivity."), `team` / `teamId` **[Internal]** (null = workspace-level).

Product: workspace-level statuses on all plans; team-specific statuses on Business/Enterprise; "A project uses the statuses available to its lead team, even when other teams contribute to it." When the lead team or available statuses change, Linear keeps the current status if still available, else matches name + lifecycle category, else another status in that category. ([project-status](https://linear.app/docs/project-status))

Lifecycle timestamps on `Project` (all nullable `DateTime`):

| Field | Schema comment |
| --- | --- |
| `startedAt` | "The time at which the project was moved into a started status. Null if the project has not been started." |
| `completedAt` | "The time at which the project was moved into a completed status. Null if the project has not been completed." |
| `canceledAt` | "The time at which the project was moved into a canceled status. Null if the project has not been canceled." |

There is **no** `pausedAt` (or any other pause-status timestamp) on `Project`, `ProjectSearchResult`, or `ProjectWebhookPayload`. `paused` exists only as `ProjectStatusType.paused`.

`ProjectFilter.startedAt`: "Comparator for the project started date (when it was moved to an "In Progress" status)." — product name for the `started` type.

Other times: `createdAt`, `updatedAt`, `archivedAt`, `autoArchivedAt` ("automatically archived by the auto-pruning process"), `trashed`.

`ProjectUpdateInput` can set `canceledAt` and `completedAt`. It cannot set `startedAt`. Create input cannot set any of the three.

`projectStatusArchive`: "The status must not have any active projects assigned to it and must not be the last status of its type."

### Progress and scope

`Project.progress: Float!`: "The overall progress of the project. This is the (completed estimate points + 0.25 * in progress estimate points) / total estimate points."

`Cycle.progress: Float!` (comparison only): "The overall progress of the cycle as a number between 0 and 1. Calculated as (completed estimate points + 0.25 * in-progress estimate points) / total estimate points. Returns 0 if no estimate points exist."

Same arithmetic. Cycle additionally documents range `[0, 1]` and empty-total → `0`. Project.progress does not.

Related Project fields:

| Field | Schema |
| --- | --- |
| `scope` | `Float!` — "The overall scope (total estimate points) of the project." |
| `currentProgress` | `JSONObject!` **[INTERNAL]** — "broken down by issue status category" |
| `progressHistory` | `JSONObject!` **[INTERNAL]** — "tracking issue completion over time" |
| `completedScopeHistory` | `[Float!]!` — "completed estimation points at the end of **each week** since project creation" |
| `inProgressScopeHistory` | `[Float!]!` — "in-progress estimation points at the end of each week" |
| `scopeHistory` | `[Float!]!` — "total scope (estimation points) … at the end of each week" |
| `completedIssueCountHistory` | `[Float!]!` — completed issue counts, weekly |
| `issueCountHistory` | `[Float!]!` — total issue counts, weekly |

Cycle's matching history arrays are **daily**, not weekly.

`Issue.estimate`: "The estimate of the complexity of the issue… Null if no estimate has been set." Team `issueEstimationType` is `"notUsed" | "exponential" | "fibonacci" | "linear" | "tShirt"`; `defaultIssueEstimate` is "What to use as a default estimate for unestimated issues."

Project graph (product, not schema): graphs generate after the project is in a Started status; points are weekly; "If estimates are off in a team, all issues are treated as 1 estimate point"; remaining points "summing the points of incomplete issues with a 1/4 modifier for any in-progress issues"; canceling/removing issues reduces scope. ([project-graph](https://linear.app/docs/project-graph))

Cycle graph FAQ uses the same 25% for started issues as "Cycle Success," with an explicit count example. ([cycle-graph](https://linear.app/docs/cycle-graph))

None of `progress`, `scope`, or the history arrays appear on `ProjectCreateInput` / `ProjectUpdateInput` — they are read-only.

### Health vs Project updates

These are different axes from status and from progress.

`Project.health: ProjectUpdateHealthType` — "The overall health of the project, **derived from the most recent project update**. Possible values are onTrack, atRisk, or offTrack. Null if no health has been reported."

`Project.healthUpdatedAt` — "typically when a new project update is posted. Null if health has never been set."

`Project.lastUpdate: ProjectUpdate` — "The most recent status update posted for this project. Null if no updates have been posted."

```
enum ProjectUpdateHealthType {
  atRisk
  offTrack
  onTrack
}
```

`type ProjectUpdate`: "A status update posted to a project. Project updates communicate progress, health, and blockers to stakeholders. Each update captures the project's health at the time of writing…"

`ProjectUpdate.health: ProjectUpdateHealthType!` — health **at the time this update was posted**. Create input `health` is optional; the stored type is non-null.

Also on `ProjectUpdate`: `body`, `user`, `createdAt`, `editedAt`, `diff` / `diffMarkdown` / `isDiffHidden`, `isStale`, `infoSnapshot` **[Internal]** ("snapshot of project properties at the time the update was posted, including milestone and issue progress"), `shortSummary`, `comments`, `reactions`.

`ProjectUpdateCreateInput.projectId` is required. `body` and `health` are optional in the input.

Product: health indicator is On track / At risk / Off track; first update is the lead's job, then any workspace member; latest update shows on overview. Progress-since-last-update details appear in the draft when overall progress changed by more than 2%. Reminders go to the project lead for projects whose status is in the In Progress (`started`) category. ([initiative-and-project-updates](https://linear.app/docs/initiative-and-project-updates))

Filter overlay, not a health enum value: `ProjectFilter.healthWithAge` compares `onTrack, atRisk, offTrack, outdated, noUpdate`. Product staleness: "Update Missing" when last update was On Track and an update is one reminder cycle + 3 days overdue; "No Update expected" if completed or reminder schedule is Never. ([initiative-and-project-updates](https://linear.app/docs/initiative-and-project-updates))

`projectUpdateRemindersPausedUntilAt` pauses **reminders**, not project status.

### Milestones

`Project.projectMilestones` → `ProjectMilestone`.

`type ProjectMilestone`: belongs to exactly one `project: Project!`. Fields: `name`, `description`, `sortOrder`, `targetDate: TimelessDate`, `status: ProjectMilestoneStatus!`, `progress: Float!` ("The progress % of the project milestone."), `currentProgress` / `progressHistory` **[Internal]**, `issues`.

```
enum ProjectMilestoneStatus {
  done
  next
  overdue
  unstarted
}
```

Create requires `name` and `projectId`. Update can change `name`, `description`, `sortOrder`, `targetDate`, `projectId`. **Neither create nor update accepts `status` or `progress`** — both are read-only / derived.

Product: milestones are per-project ("This isn't currently possible" to share across projects); an issue in a project with milestones can be assigned one; `Shift M`; reorder via `sortOrder`; converting a milestone to a project is a product action with **no public mutation** in this schema snapshot (`projectMilestoneMove` is **[Internal]**). ([project-milestones](https://linear.app/docs/project-milestones))

Product progress wording (not a formula): "Progress starts counting the moment an issue moves to a started status, and increases further once it's completed." Yellow focus on "the next incomplete milestone"; that indicator cannot be turned off. Filters: `nextProjectMilestone`, `completedProjectMilestones`.

`Issue.projectMilestone` is singular and nullable. `IssueCreateInput.projectMilestoneId` has no further documented constraint in the schema.

### Members vs teams vs lead

| Role | Schema |
| --- | --- |
| Teams | `Project.teams: TeamConnection!` — "Teams associated with this project." Create: `teamIds: [String!]!` (required). Update: `teamIds: [String!]` |
| Lead | `Project.lead: User` — "The user who leads the project. The project lead is typically responsible for posting status updates and driving the project to completion. Null if no lead is assigned." Create/update: `leadId` |
| Members | `Project.members: UserConnection!` — "Users that are members of the project." Create/update: `memberIds` |
| Lead team | `leadTeam: Team` and `leadTeamId: String!` **[Internal]** |

Product: one lead ("We have a single lead field"); extra people are members; "members have to opt-in to receive notifications." Multi-team: "One of a project's teams is its lead team, which clarifies ownership and determines its available project statuses. The other teams contribute to the project." ([projects](https://linear.app/docs/projects))

Teams and members are different relations: teams own Issues that can sit in the Project; members are Users on the Project.

### Dates (planned vs actual)

Planned:

- `startDate: TimelessDate` — "estimated start date"
- `startDateResolution: DateResolutionType`
- `targetDate: TimelessDate` — "estimated completion date"
- `targetDateResolution: DateResolutionType`

```
enum DateResolutionType {
  halfYear
  month
  quarter
  year
}
```

`scalar TimelessDate`: ISO 8601 date; shortcuts like `2021`; ISO 8601 durations relative to now.

Product timeframes: year, half-year, quarter, month, **or precise day**. ([projects](https://linear.app/docs/projects)) There is no `day` value in `DateResolutionType`.

Actual status-move times are `DateTime` (`startedAt` / `completedAt` / `canceledAt`), not `TimelessDate`.

### Issue membership

`Issue.project: Project` — "Null if the issue is not part of any project." Singular.

Product: "Issues can only be associated with one project at a time." ([projects](https://linear.app/docs/projects))

### Priority, labels, resources

`priority: Int!` — "0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low" (same integers as Issue). `priorityLabel: String!`. Matches [project-priority](https://linear.app/docs/project-priority).

`labels` / `labelIds` are `ProjectLabel` entities (workspace- or team-scoped), not Issue labels. ([project-labels](https://linear.app/docs/project-labels); `type ProjectLabel`)

Resources: `documents`, `externalLinks`, `attachments`, `resourceCount` ("documents, external links, and attachments"). Product Resources section on the overview. ([projects](https://linear.app/docs/projects))

Slack: `slackChannelId`; several `slackIssue*` booleans are `@deprecated`.

### Create / update / delete (documented)

`projectCreate(input: ProjectCreateInput!)`:

Required in GraphQL: `name: String!`, `teamIds: [String!]!`.

Optional: `statusId`, `description`, `content`, `leadId`, `memberIds`, `labelIds`, `priority`, `startDate` + resolution, `targetDate` + resolution, `color`, `icon`, `templateId` / `useDefaultTemplate`, `convertedFromIssueId`, `leadTeamId` **[Internal]**.

Product UI: "The only required fields are the project name and status." ([projects](https://linear.app/docs/projects)) That is the UI, not `ProjectCreateInput`.

`projectUpdate(id, input: ProjectUpdateInput)`: "All fields are optional; only provided fields will be updated. Setting a field to null (where supported) will clear the value." Adds reminder schedule fields, `trashed`, `canceledAt`, `completedAt`. Does not accept `progress` or `health` (health is set by posting a `ProjectUpdate`).

`projectDelete`: "Deletes (trashes) a project. The project can be restored later with `projectUnarchive`." `projectArchive` is `@deprecated` "in favor of projectDelete." Product: recently deleted for 30 days. ([projects](https://linear.app/docs/projects))

Getting started notes "most other objects are team based" and walks Issue create, not Project create. ([graphql](https://linear.app/developers/graphql))

Webhooks: `Projects` and `Project updates` are supported data-change models. Payload "reflects that of the corresponding GraphQL entity." ([webhooks](https://linear.app/developers/webhooks)) `ProjectWebhookPayload` includes `startedAt`, `completedAt`, `canceledAt`, `health`, `teamIds`, `memberIds`, `milestones`, weekly histories — still no `pausedAt`, and no live `progress`/`scope` on the webhook type.

### Initiative (edge only)

`Project.initiatives` / `initiativeToProjects`: "Initiatives that this project belongs to" / "Associations of this project to parent initiatives." `ProjectFilter.initiatives`. Not specified further here.

## Inferences

1. **Progress and Cycle share one formula.** Schema text for `Project.progress` is the Cycle formula without the `[0, 1]` and empty-total sentences. Same `Float!`. Treating Project.progress as 0..1 with 0 on empty total is consistent with Cycle, not independently documented for Project.
2. **"In progress" points are Issues in a started workflow category.** Schema never names the workflow types inside the Project formula. `inProgressScopeHistory` is "in-progress estimation points"; product graph counts "Started" issues; Cycle's formula uses the same 0.25 term.
3. **Canceled Issues drop out of scope.** Not in the Project.progress comment. Product graph FAQ: canceling issues reduces scope so the Scope and Progress lines stay representative. ([project-graph](https://linear.app/docs/project-graph))
4. **Unestimated Issues count as 1 point when the team does not use estimates.** Documented for the project **graph**, not for `Project.progress`. Teams that use estimates have `defaultIssueEstimate` for unestimated issues — whether `Project.progress` uses that default, 0, or 1 is not stated.
5. **`startedAt` / `completedAt` / `canceledAt` follow `status.type`, not the display name.** Field comments say "moved into a started/completed/canceled status." Paused has a type but no timestamp, so pausing is a status change without a dedicated clock.
6. **Health is not computed from Issues.** It is copied from the latest `ProjectUpdate.health`. Progress can move while health stays `onTrack` until someone posts an update (product reminder/staleness machinery sits on top of that).
7. **Milestone `status` and `progress` are derived.** They are non-null on the type and absent from inputs. `next` matches product "current/next incomplete milestone." `overdue` is likely `unstarted`/`next` past `targetDate`.
8. **Milestone `progress` is probably the same 0.25-started mix, as a percentage.** Product: counting starts when an issue is started, then increases at completed. Schema says "progress %" (unlike Project.progress, which does not say percent). Replica's completed/total count is a different measure.
9. **Precise-day timeframe is `startDate`/`targetDate` with null resolution.** `DateResolutionType` has no `day`.
10. **Lead team is a real product rule, hidden on the public type.** Schema marks `leadTeam` / `leadTeamId` Internal; product docs use it to pick the status set. Public create still requires `teamIds`.
11. **Default status on API create is unspecified.** UI requires a status; `statusId` is optional in `ProjectCreateInput`. Getting started documents a default Issue workflow state; it does not document a default Project status.

## Unknowns

- Exact numerator/denominator membership for `Project.progress`: canceled, backlog, triage, completed-then-reopened, parent vs sub-issues, mixed-team estimation scales inside one project.
- Whether `Project.progress` is documented-range 0..1 (Cycle yes, Project silent).
- Shape of Internal `currentProgress` / `progressHistory` JSON.
- Default `statusId` when omitted on `projectCreate`.
- Whether writing `completedAt`/`canceledAt` via `ProjectUpdateInput` without a matching `statusId` is accepted, ignored, or rejected.
- Default `ProjectUpdate.health` when create omits `health` but the stored field is non-null.
- Formula and units for `ProjectMilestone.progress` (percent 0–100 vs 0–1; canceled issues; 0.25 vs count).
- Derivation table for `ProjectMilestoneStatus` (`done` / `next` / `overdue` / `unstarted`).
- Whether assigning `projectMilestoneId` without `projectId` (or with a milestone of another project) is rejected by the API. Schema does not say.
- Empty `teamIds: []` on create (type is `[String!]!`, which still allows an empty list).
- How `identifier` formats when the SDL comment is garbled; whether public clients should use `slugId` instead of Internal `identifier`.
- Client-only rules (filter evaluation, graph prediction ±40%, yellow milestone focus). Out of scope here; later REA ticket.

## Invariants (locked from public sources)

1. A Project is a collection of Issues toward a shared goal; it may span multiple Teams. (schema `type Project`; [conceptual-model](https://linear.app/docs/conceptual-model))
2. An Issue belongs to at most one Project. (schema `Issue.project: Project`; [projects](https://linear.app/docs/projects))
3. Create via API requires `name` and `teamIds`. (`ProjectCreateInput`)
4. Status is a `ProjectStatus` entity whose `type` is one of `backlog | planned | started | paused | completed | canceled`. (`Project.status`, `enum ProjectStatusType`)
5. `startedAt` / `completedAt` / `canceledAt` record moving into those **types**. There is no `pausedAt`. (schema `Project` fields)
6. Progress is estimate-point arithmetic: `(completed + 0.25 * in-progress) / total`. (`Project.progress` comment; same expression as `Cycle.progress`)
7. Progress and scope are not writable. (absent from create/update inputs)
8. Health ∈ {`onTrack`, `atRisk`, `offTrack`} or null, and is derived from the latest Project update — not from status, not from progress. (`Project.health` comment; `enum ProjectUpdateHealthType`)
9. Posting health happens by creating a `ProjectUpdate`, not by `projectUpdate` (the Project mutation). (`ProjectUpdateCreateInput` vs `ProjectUpdateInput`)
10. A Milestone belongs to exactly one Project; Issues reference at most one Milestone. (`ProjectMilestone.project: Project!`; `Issue.projectMilestone`)
11. Milestone `status` and `progress` are not client-writable. (absent from milestone create/update inputs)
12. Lead is a single User; members are Users; teams are Teams. Three relations. (`lead`, `members`, `teams`; [projects](https://linear.app/docs/projects) "single lead field")
13. Planned dates are `TimelessDate` plus optional `DateResolutionType` (`year | halfYear | quarter | month`). Actual lifecycle times are `DateTime`.
14. Priority integers match Issue: 0 none, 1 urgent, 2 high, 3 medium, 4 low. (`Project.priority`)
15. Delete is trash; restore is `projectUnarchive`. (`projectDelete` comment)
16. Initiative association is a many-to-many edge (`initiatives` / `initiativeToProjects`), not part of the Project's own lifecycle.

## Delta vs this replica (informational)

Not an adoption decision.

### Types (`src/types.ts`)

| Replica | Linear public API |
| --- | --- |
| `ProjectStatus` = six strings | `ProjectStatus` entity with custom `name` + `ProjectStatusType` (those six) |
| `status` on Project is that enum | `status: ProjectStatus!`; deprecated `state: String!` |
| No `startedAt` / `completedAt` / `canceledAt` | All three present; no `pausedAt` |
| `health?: ProjectHealth` stored on Project | `health` derived from last `ProjectUpdate`; plus `healthUpdatedAt`, `lastUpdate` |
| `updates: ProjectUpdate[]` embedded | `projectUpdates` connection; `ProjectUpdate` is its own Node |
| `weekProgress` / `nextFocus` / `risks` strings | No such fields. Written content lives in `ProjectUpdate.body` / `content` |
| `memberIds` + `teamKeys` | `members` (Users) and `teams` (Teams); plus `lead` |
| `initiativeIds: string[]` | `initiatives` connection (edge only) |
| `labels: string[]` | `ProjectLabel` entities |
| `startDate` / `targetDate` optional strings | `TimelessDate` + `DateResolutionType` |
| No `progress` / `scope` / history arrays | `progress`, `scope`, weekly histories, Internal `currentProgress` |
| `ProjectMilestone` = id, projectId, name, targetDate, sortOrder | Also derived `status`, `progress`, description; no replica `status`/`progress` |
| `milestoneStats` lives in logic, not on the type | `ProjectMilestone.progress` / `status` on the type |
| `slackChannel?: string` | `slackChannelId` |
| `resources: ProjectResource[]` | `documents` + `externalLinks` + `attachments` |
| `lead?: string` (display name) | `lead: User` |
| `description` only | short `description` plus markdown `content` |

Replica `ProjectUpdate` (`health`, `body`, `author`, `time`) is a thin slice of Linear `ProjectUpdate` and is the right *kind* of object (a posted report with health), not a progress snapshot.

### Progress formula (`src/logic.ts` `projectScope`)

Replica comment claims Linear `Project.progress` and implements:

`(completed estimate points + 0.25 * in-progress estimate points) / total`, with `estimate ?? 1`, excluding `canceled` from all three buckets.

**Match:** the 0.25 expression is what `Project.progress` documents, and it is the same expression as `Cycle.progress`. Product graph remaining-points text uses a ¼ modifier for in-progress. Unestimated = 1 is documented for the **graph** when estimates are off. Canceled reducing scope is documented for the **graph**.

**Not grounded as Project.progress rules:** `estimate ?? 1` for teams that *do* use estimates (schema has `defaultIssueEstimate`); treating replica `status === "progress"` / `"done"` as Linear workflow types; empty-total → 0 (Cycle documents this, Project.progress does not); returning `{ scope, started, completed, ratio }` vs a single `Float` plus separate `scope`.

Do not treat `projectScope` as Linear's formula. Linear's documented formula is the schema comment on `Project.progress`.

### Milestone formula (`milestoneStats`)

Replica: `completed count / live count` (canceled excluded), percent 0–100.

Linear schema: `progress: Float!` "progress %"; product: started issues already contribute. Different measure until a later ticket proves otherwise.

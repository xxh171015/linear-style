# Linear Custom View (public GraphQL API)

Pinned schema: [`linear/linear` `packages/sdk/src/schema.graphql` @ `8397645`](https://github.com/linear/linear/blob/8397645bc0a496f68896b18ec6453dddd5e51927/packages/sdk/src/schema.graphql) (committed 2026-10-28). Raw: <https://raw.githubusercontent.com/linear/linear/8397645bc0a496f68896b18ec6453dddd5e51927/packages/sdk/src/schema.graphql>.

This note answers: **what is Linear's Custom View, as specified by the public GraphQL API and developer docs** — not by this replica. It does not decide a replica subset. It does not specify client-side filter evaluation.

## Sources

| Source | Role |
| --- | --- |
| [GraphQL schema `CustomView`, `CustomViewCreateInput`, `IssueFilter`, `ViewPreferences*`](https://github.com/linear/linear/blob/8397645bc0a496f68896b18ec6453dddd5e51927/packages/sdk/src/schema.graphql) | Owning source for types, fields, and field descriptions |
| [Getting started (GraphQL)](https://linear.app/developers/graphql) | Public API is GraphQL at `https://api.linear.app/graphql`; introspectable; same API Linear uses internally |
| [Filtering](https://linear.app/developers/filtering) | How `IssueFilter` / relationship filters / comparators / `and`–`or` work on paginated queries |
| [developers.linear.app](https://developers.linear.app/) | Index of GraphQL API / SDK; no Custom View page |
| [Custom Views](https://linear.app/docs/custom-views) | Supporting product language for share/scope (not the GraphQL contract) |
| [Display options](https://linear.app/docs/display-options) | Supporting product language for preferences vs filters |
| [Filters](https://linear.app/docs/filters.md) | Supporting: product filters save into Custom Views; API details deferred to developer filtering docs |
| Replica `src/types.ts` `CustomView` / `CustomViewFilter` and `src/logic.ts` `matchesView` | Informational delta only |

`https://developers.linear.app/docs/graphql/working-with-the-graphql-api/filtering` is a shell that does not publish the filtering spec. The filtering spec that exists is [linear.app/developers/filtering](https://linear.app/developers/filtering).

## Gist

A Linear Custom View is a named, owned, optionally shared saved query over **one** View Model (`Issue`, `Project`, `Initiative`, or `FeedItem`). The model is **not** an input: it is derived from which typed filter payload is set. The saved query (membership) lives on `CustomView`; layout, grouping, ordering, and display properties live on a separate `ViewPreferences` record and are read as merged `viewPreferencesValues`. Built-in lists (My Issues, Team Issues, …) are `ViewType` values, not Custom Views.

## Observations

### Identity

- `CustomView` implements `Node`: `id`, `createdAt`, `updatedAt`, optional `archivedAt`. Schema: type `CustomView`.
- `name: String!` — "displayed in the sidebar and navigation." Schema: `CustomView.name`.
- `description: String` optional. Schema: `CustomView.description`.
- `icon: String` — "emoji or a decorative icon identifier"; `color: String` — "hex color code of the custom view icon." Schema: `CustomView.icon`, `CustomView.color`.
- `slugId: String!` — "unique URL slug, used to construct human-readable URLs. Automatically generated on creation." Schema: `CustomView.slugId`.
- Lookup: `customView(id: String!): CustomView!` — "looked up by ID or slug." Schema: `Query.customView`.
- Workspace: `organization: Organization!`. Schema: `CustomView.organization`.
- Mutations: `customViewCreate`, `customViewUpdate`, `customViewDelete`. Create requires only `name`. Schema: `Mutation.customViewCreate` / `CustomViewCreateInput`.

### View Model (`modelName`)

`modelName: String!` is **not** an enum and is **not** on create/update input.

Schema description of `CustomView.modelName`:

> The entity type this view displays. Determined by which filter is set: "Project" if `projectFilterData` is set, "Initiative" if `initiativeFilterData` is set, "FeedItem" if `feedItemFilterData` is set, or "Issue" by default.

That is a priority list, not four independent flags:

1. `projectFilterData` set → `"Project"`
2. else `initiativeFilterData` set → `"Initiative"`
3. else `feedItemFilterData` set → `"FeedItem"`
4. else `"Issue"`

Matching connections empty-out when the model does not match:

| Connection | Empty unless `modelName` is |
| --- | --- |
| `issues` | `"Issue"` |
| `projects` | `"Project"` |
| `initiatives` | `"Initiative"` |
| `updates` (feed items) | `"FeedItem"` |

Schema: `CustomView.issues`, `.projects`, `.initiatives`, `.updates`.

`Query.customViewDetailsSuggestion(modelName: String)` uses different casing: valid values `"issue"`, `"project"`, `"initiative"`, `"feedItem"` (lowercase; default `"issue"`). Schema: `Query.customViewDetailsSuggestion`. That argument is INTERNAL. Public `CustomView.modelName` descriptions use PascalCase.

### Filters (membership)

Four payloads. Output type stores them as `JSONObject`; create/update take the typed filter inputs used elsewhere in the API.

| Field | Output | Input | When the view uses it |
| --- | --- | --- | --- |
| `filterData` | `JSONObject!` (always present) | `IssueFilter` optional | `modelName` is `"Issue"` |
| `projectFilterData` | `JSONObject` | `ProjectFilter` optional | set → `"Project"` |
| `initiativeFilterData` | `JSONObject` | `InitiativeFilter` optional; create input marked `[ALPHA]` | set → `"Initiative"` |
| `feedItemFilterData` | `JSONObject` | `FeedItemFilter` optional | set → `"FeedItem"` |

Schema: `CustomView.*FilterData`, `CustomViewCreateInput`, `CustomViewUpdateInput`.

`CustomView.filters: JSONObject!` is deprecated: "Will be replaced by `filterData` in a future update." Schema: `CustomView.filters`.

Create-input comments on the three non-issue fields say "applied to **issues** in the custom view." The output-type comments contradict that and match `modelName`: project/initiative/feed filters make the view display those entities **instead of** issues. Trust the output type.

Create/update do not accept `modelName`. You choose the model by which filter input you send.

`IssueFilter` (and the other `*Filter` inputs) is the same comparator language documented at [Filtering](https://linear.app/developers/filtering): default logical **and** of fields, `or` / `and` compounds, relationship filters, `eq`/`in`/`contains`/…, `null`, relative ISO-8601 durations on dates. Public `IssueFilter` fields include `assignee` (`NullableUserFilter`, with `isMe`), `creator`, `subscribers`, `state`, `priority` (0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low), `labels`, `project`, `team`, `cycle`, `title`, due/completed dates, relations, and more. Schema: `input IssueFilter`. That language is how the API **stores and queries** a view's membership. How Linear.app evaluates the same JSON in the desktop client is a later ticket.

`input CustomViewFilter` is **not** the view's issue predicate. It filters the **list of Custom Views** (`Query.customViews(filter: CustomViewFilter)`): name, `modelName`, `shared`, `team`, `creator`, dates, INTERNAL `hasFacet`.

### Scope

`CustomViewCreateInput` header: "Optionally scope the view to a team, project, or initiative."

| Scope | Create | On `CustomView` | Notes |
| --- | --- | --- | --- |
| Team | `teamId: String` | `team: Team` — "Null if the view is workspace-wide or scoped to a project/initiative instead." | Public on the type |
| Project | `projectId: String` | **no `project` field** | Update `projectId` is `[Internal]` |
| Initiative | `initiativeId: String` | **no `initiative` field** | Update `initiativeId` is `[Internal]` |
| Workspace-wide | omit the three | `team` is null (and not project/initiative scoped) | |

`Query.customViews`: "All custom views accessible to the user, including personal views and shared workspace views. **Excludes views scoped to a specific project or initiative.**"

Team-scoped issue/project/feed connections take `includeSubTeams` (issues and updates default `false`; projects default `true`). Schema: `CustomView.issues`, `.projects`, `.updates`.

### Shared vs owner

- `owner: User!` — "For personal views, only the owner can see and edit the view." Distinct from `creator: User!` ("originally created"). Create/update accept `ownerId`.
- `shared: Boolean!` — "shared with everyone in the organization. Shared views appear in the workspace sidebar for all members. Personal (non-shared) views are only visible to their owner."

Supporting product doc ([Custom Views](https://linear.app/docs/custom-views)): workspace-level shared views appear under Workspace views for full members; choosing a team, project, or initiative at create time scopes the shared view to that entity. Copying a URL does not grant access; the view must already be shared. Owner defaults to creator and can be changed.

Permissions beyond `shared` / `owner` / `team` (who may edit a shared view, guests, private teams) are not specified by these public fields.

### View preferences (display)

Membership is not grouping/layout. Display lives on `ViewPreferences` / `ViewPreferencesValues`.

On `CustomView`:

- `organizationViewPreferences: ViewPreferences` — "workspace-level default view preferences for this custom view, if any have been set."
- `userViewPreferences: ViewPreferences` — "current user's personal view preferences for this custom view, if they have set any."
- `viewPreferencesValues: ViewPreferencesValues` — "computed … merging organization defaults with user overrides and system defaults. Use this for the effective display settings rather than reading raw preferences directly."

`ViewPreferences`:

- `type: String!` — `"organization"` workspace-wide defaults or `"user"` personal overrides (create input uses enum `ViewPreferencesType { organization, user }`).
- `viewType: String!` — "board, cycle, project, customView, myIssues, etc." Create input uses enum `ViewType`, which includes `customView` **and** built-in pages (`myIssues`, `allIssues`, `board`, `project`, `initiatives`, `inbox`, …). Built-in pages are not Custom Views.
- `preferences: ViewPreferencesValues!`

Create: `viewPreferencesCreate(input: ViewPreferencesCreateInput!)`. `customViewId` associates preferences with a Custom View; `type` and `viewType` are required; `preferences: JSONObject!`. "If conflicting preferences already exist for the same view type and scope, the existing preferences are replaced." Update: "For user-type preferences, only the owning user can update them."

`ViewPreferencesValues` is a flat bag of optional fields covering many Linear surfaces. Fields that apply to Custom Views over issues/projects/initiatives (names are schema fields; allowed **values** are `String`, not enums):

| Concern | Fields |
| --- | --- |
| Layout | `layout` ("issue layout type"), `projectLayout` ("project layout type") |
| Grouping | `issueGrouping`, `issueSubGrouping`, `issueGroupingLabelGroupId`, `issueSubGroupingLabelGroupId`, `projectGrouping`, `projectSubGrouping`, `initiativeGrouping`, plus label-group helpers |
| Ordering | `viewOrdering` + `viewOrderingDirection` (issues), `projectViewOrdering`, `initiativesViewOrdering`, `groupOrderingMode`; `columnOrderBoard` / `columnOrderList`; `closedIssuesOrderedByRecency` |
| Nesting / empty groups / completed | `issueNesting`, `showSubIssues`, `showParents`, `showEmptyGroups` (+ board/list variants), `showCompletedIssues`, `showCompletedProjects`, `showTriageIssues`, `showSubTeamIssues`, `showSubTeamProjects` |
| Display properties (issues) | `fieldId`, `fieldStatus`, `fieldAssignee`, `fieldPriority`, `fieldProject`, `fieldLabels`, `fieldEstimate`, `fieldDueDate`, `fieldCycle`, `fieldMilestone`, `fieldSla`, `fieldRelease`, … |
| Display properties (projects / initiatives) | `projectField*` / `initiativeField*` |

Supporting product doc ([Display options](https://linear.app/docs/display-options)): display options are **not** filters — they hide or show data on items already in the list. "Set as default" is the workspace default; omitting that keeps a personal preference. Issue views: list/board. Project views: list/board/timeline. Initiative views: list/timeline. Issue grouping examples: status, assignee, project, priority, cycle, label, parent, team, customer, release, SLA, or none. Issue ordering examples: status, manual, priority, last created, last updated, due date, link count.

Those strings are **not** GraphQL enums. The public type is `String`.

### Facet (supporting; fog)

`CustomView.facet: Facet` is `[INTERNAL]`: "links this custom view to its parent entity (project, initiative, team page, etc.). Null if the view is not attached to any parent via a facet."

`Facet` is "a join between entities" targeting exactly one Custom View (`targetCustomView`), with exactly one source (team / project / initiative / organization / user feed) and optional `sourcePage: FacetPageSource { feed, initiatives, projects, teamIssues }`.

Project/initiative scope is writable on create (`projectId` / `initiativeId`) but not readable on `CustomView` except via this INTERNAL field. Do not expand Facet into a spec here. Map already lists Custom View facets as not yet specified.

Notifications (`CustomViewNotificationSubscription`, Slack on a view) are out of scope.

## Inferences

1. **View Model is derived, not stored as an independent enum.** Sending `projectFilterData` (and not relying on `modelName` input) is how a Project view is created. The documented priority implies that if more than one of project/initiative/feed filters is set, Project wins, then Initiative, then FeedItem.
2. **`filterData` is always non-null** even for Project/Initiative/FeedItem views. Non-issue views still carry an issue-filter JSON (likely empty). Membership for those views is the *other* payload.
3. **Filter vs preferences is a hard split.** Changing grouping/layout does not change which entities match. Changing `filterData` does not change `layout` / `issueGrouping`. Effective display is `viewPreferencesValues`, not the raw org/user records.
4. **Team scope and filter `team:` are different.** `CustomView.team` is the view's home. `IssueFilter.team` further restricts issues inside an Issue view (including a workspace-wide one). Product docs: an All-teams view plus filters can limit to selected teams without making the view team-scoped.
5. **`ViewType.customView` vs `modelName`.** `ViewType` names the *client page* preferences attach to. `modelName` names the *entity* the saved query returns. A Custom View of Projects still uses view preferences with `viewType: customView` (plus `customViewId`), not `ViewType.projects`.
6. **Project/initiative-scoped views are first-class on create but second-class on read.** `customViews` excludes them; the type has no `project`/`initiative` field. Listing or inspecting them from the public API is underspecified without INTERNAL `facet`.

## Unknowns

- Allowed **string values** for `issueGrouping`, `layout`, `projectLayout`, `viewOrdering`, `showCompletedIssues`, and the rest of `ViewPreferencesValues`. Schema types them as `String` / `Boolean`; product docs list examples only.
- What "set" means for `projectFilterData` when the JSON is `{}` versus omitted/`null`.
- Server behavior if two of project/initiative/feed filters are set at once (priority is documented; rejection is not).
- Whether `CustomView.issues(filter:)` **and**s with saved `filterData` or replaces it.
- How `includeSubTeams` interacts with a null `team` (workspace-wide).
- How to **read** project/initiative association after create without INTERNAL `facet`.
- Who can **edit** a shared view besides the owner; guest/private-team visibility.
- Whether `initiativeFilterData` `[ALPHA]` on create is still alpha in product (saved initiative views: Enterprise in product docs).
- Evaluation of saved `IssueFilter` JSON inside Linear.app (later ticket).
- Manual issue order: product docs say it is workspace-global; not visible as a `ViewPreferencesValues` field.

## Filter vs preferences split

```
CustomView
  identity:     id, slugId, name, description, icon, color
  model:        modelName  ← derived from which *FilterData is set
  membership:   filterData | projectFilterData | initiativeFilterData | feedItemFilterData
  scope:        team (projectId/initiativeId on create only)
  sharing:      shared, owner, creator
  display:      organizationViewPreferences, userViewPreferences
                  └─ merged → viewPreferencesValues
                       layout / projectLayout
                       issueGrouping / projectGrouping / initiativeGrouping
                       viewOrdering / projectViewOrdering / …
                       field* / projectField* / initiativeField*
```

Filters answer **which rows**. Preferences answer **how those rows are shown**. [Display options](https://linear.app/docs/display-options) states the same split in product language. [Filters](https://linear.app/docs/filters.md) states that product filters are how you refine lists and create Custom Views, and points at the developer filtering docs for the API shape.

## Informational delta vs this replica

Not an adoption decision. Replica sources: `src/types.ts` (`CustomView`, `CustomViewFilter`, `ViewModelName`, `ViewLayout`, `IssueGrouping`), `src/logic.ts` `matchesView`.

| | Linear public API | Replica |
| --- | --- | --- |
| View Model | `modelName: String!` derived from which filter is set; four values documented | `ViewModelName` union of the same four; stored, not derived |
| Membership | Four typed filters (`IssueFilter` / `ProjectFilter` / `InitiativeFilter` / `FeedItemFilter`); stored as JSON | One flattened `CustomViewFilter`: `assignedToMe`, `createdByMe`, `subscribed`, `statuses`, `projectId`, `labels`, `priority` |
| Name collision | `CustomViewFilter` filters the **views list** | `CustomViewFilter` **is** the issue predicate |
| Scope | `team`, create-time `projectId` / `initiativeId`; workspace-wide when team is null | optional `teamKey` only |
| Sharing | `shared: Boolean!`, `owner: User!`, `creator: User!` | `shared: boolean`, `owner: string` (display name) |
| `slugId` | present, auto-generated, lookup key | present (seeded by hand) |
| Display | Separate `ViewPreferences` org/user + merged `viewPreferencesValues` | `grouping` and `layout` fields **on** `CustomView` |
| Grouping | `issueGrouping: String` (open) | `IssueGrouping` = `status \| priority \| assignee \| project \| none` |
| Layout | `layout` / `projectLayout`: `String` (product: list/board/timeline) | `ViewLayout` = `list \| board` |
| Evaluation | Server connections `issues`/`projects`/`initiatives`/`updates`; client evaluation unspecified here | `matchesView` only for `modelName === "Issue"`, boolean flags vs issue fields |
| Icon | `String` | `"issues" \| "focus" \| "project"` |

Replica `matchesView` is a local boolean over that flattened filter. Linear's saved filter is the GraphQL comparator tree from [Filtering](https://linear.app/developers/filtering). They are not the same object.

## Glossary terms this note locks

- **Custom View** — saved query; not a built-in list; not View Preferences.
- **View Model** — Issue / Project / Initiative / FeedItem; derived from filter payloads.
- **View Preferences** — layout, grouping, ordering, display properties; org default merged with user override.

Facet stays unnamed in the glossary (fog).

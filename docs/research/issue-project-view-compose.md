# How Issue, Project, and Custom View compose in Linear

How the three cores sit together as a product — not three isolated types.

This file is Linear-as-it-is. It does not decide this replica's subset. It does not specify client-side filter evaluation (that is another ticket). It does not copy Linear source.

## Sources

Fetched 2026-11-02.

Prior findings (read first; this note verifies composition against the public sources they cite):

| Finding | Branch |
| --- | --- |
| [Issue GraphQL model](https://github.com/xxh171015/linear-style/blob/research/issue-graphql-model/docs/research/issue-graphql-model.md) | `research/issue-graphql-model` |
| [Project GraphQL model](https://github.com/xxh171015/linear-style/blob/research/project-graphql-model/docs/research/project-graphql-model.md) | `research/project-graphql-model` |
| [Custom View GraphQL model](https://github.com/xxh171015/linear-style/blob/research/custom-view-graphql-model/docs/research/custom-view-graphql-model.md) | `research/custom-view-graphql-model` |

Public sources this note checked:

| Source | Role |
| --- | --- |
| [linear/linear `packages/sdk/src/schema.graphql`](https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql) @ `e008ca81` (`master`, 2026-11-02) | Owning source for types, fields, and field comments (`Issue`, `Project`, `Team`, `CustomView`, `ViewPreferences`, `ViewType`, `IssueFilter`) |
| [Getting started (GraphQL)](https://linear.app/developers/graphql) | Issues (and most other objects) are team-based; `User.assignedIssues` / `createdIssues` |
| [Filtering](https://linear.app/developers/filtering) | `IssueFilter` language; nested `project` / `team` / `assignee.isMe` |
| [Concepts](https://linear.app/docs/conceptual-model) | How the concepts fit together |
| [Projects](https://linear.app/docs/projects) | Issue membership; project's own Issues tab vs attached issue views |
| [Teams](https://linear.app/docs/teams) | Issues tied to one team; projects span teams; team Views page |
| [Team pages](https://linear.app/docs/default-team-pages) | Built-in All / Active / Backlog vs Custom Views |
| [Custom Views](https://linear.app/docs/custom-views) | Workspace / team / project / initiative scope; contextual views |
| [My issues](https://linear.app/docs/my-issues) | Built-in personal list; four tabs; Focus grouping |
| [Filters](https://linear.app/docs/filters) | Product filters save into Custom Views; display options are not in the URL |
| [Display options](https://linear.app/docs/display-options) | Grouping/layout are display options, not filters |
| [Assign and delegate](https://linear.app/docs/assigning-issues) | Assigned (and delegated) work appears in My Issues |
| Replica `src/types.ts`, `src/logic.ts`, `src/App.tsx` | Informational delta only |

## Gist

An Issue is owned by exactly one Team and may sit in at most one Project. A Project is a multi-team collection of those Issues; its own issue list is `Project.issues` (the Issues tab), not a Custom View. A Custom View is a named saved query over one View Model. Filtering that query to a project (`IssueFilter.project`) is membership; scoping the view to a project (`projectId` at create) is where the view lives. My Issues is a built-in, viewer-relative Issue query (`ViewType.myIssues` and siblings), not a Custom View. Grouping and layout live on View Preferences, which attach to a Custom View *or* to a built-in page; they are not fields of Issue, Project, or Custom View.

## Composition

```
Organization (workspace)
  Team ──owns──► Issue ──optional──► Project
                   ▲                    │
                   │                    └── Project.issues  (built-in list)
                   │
                   ├── Team.issues / Active / Backlog     (built-in lists)
                   ├── User.assignedIssues / createdIssues (My Issues tabs)
                   └── CustomView.filterData               (saved Issue query)

CustomView
  modelName     ← derived from which *FilterData is set
  membership    ← filterData | projectFilterData | …
  scope         ← team | projectId/initiativeId | (omit = workspace)
  display       ← ViewPreferences (viewType: customView)

Built-in pages (not CustomView records)
  ViewType.myIssues | allIssues | activeIssues | backlog | project | …
  display ← ViewPreferences (that ViewType + teamId / projectId / …)
```

Three different "lists of a project's issues" are three different objects:

| Surface | What it is | Membership |
| --- | --- | --- |
| Project Issues tab | Built-in page (`ViewType.project`) | `Project.issues` |
| Custom View *filtered* to a project | Saved Issue query, any scope | `filterData.project` |
| Custom View *scoped* to a project | Saved query attached to that project | Create `projectId`; excluded from `Query.customViews` |

## Observations

### Issue belongs to a Team, optionally a Project

Schema `type Issue`: "Issues belong to a team… and can be organized into projects and cycles."

- `team: Team!` — "Every issue must belong to exactly one team, which determines the available workflow states, labels, and other team-specific configuration."
- `project: Project` — "Null if the issue is not part of any project." Singular.
- `projectMilestone: ProjectMilestone` — null unless assigned inside that project.
- Create requires `teamId`. `projectId` is optional (UUID or `P-LIN-123`).

Schema `type Team`: "Issues belong to teams." `Team.issues` — "Issues belonging to the team."

Schema `type Project`: "A project is a collection of issues working toward a shared goal… They can span multiple teams." `Project.teams` — "Teams associated with this project." `Project.issues` — "Issues associated with the project."

Product:

- "An issue belongs to a team… It can be assigned to a person, added to a project…" ([conceptual-model](https://linear.app/docs/conceptual-model))
- "Issues can only be associated with one project at a time." ([projects](https://linear.app/docs/projects))
- "Projects can belong to a single team or be shared across many teams (but issues can only be tied to one team)." ([teams](https://linear.app/docs/teams))
- "Sub-issues can be assigned to any team or member in the workspace, not just the parent issue's team." ([teams](https://linear.app/docs/teams))

Getting started: "As issues (and most other objects) are team based, you first need to get the ID of the team you want to interact with." ([graphql](https://linear.app/developers/graphql))

Team is identity and workflow. Project is an optional grouping edge. They are not interchangeable containers.

### A Project's own issue list vs a Custom View filtered to that project

`Project.issues` is a first-class connection on Project. It is the project's issue list. Product: each project has Overview and Issues tabs; creating in the project view with `C` adds an Issue to that project; multi-team projects add tabs to "toggle between seeing all issues or issues on specific teams." ([projects](https://linear.app/docs/projects))

That Issues tab is a built-in page. `ViewPreferencesCreateInput` takes `projectId` plus `viewType: ViewType!`. `enum ViewType` includes `project` (the project page) **and** `customView` (a saved view). Display options on the project's Issues tab are preferences for `ViewType.project`, not a Custom View record.

A Custom View whose View Model is Issue can *also* name that project in `filterData` (`IssueFilter.project: NullableProjectFilter`). That is membership: which rows match. The view may be workspace-wide or team-scoped and still filter to one project. Product: "To share a view across multiple teams but limit it to projects or issues within a specific team or teams, create an All teams view and use filters to refine the list." ([custom-views](https://linear.app/docs/custom-views))

A third object: a Custom View *scoped* to a project. `CustomViewCreateInput`: "Optionally scope the view to a team, project, or initiative." Field `projectId`. Product: "Attach issue views to projects" — extra tabs next to Overview and Issues, "custom views of the project's issues," visible to anyone with project access, reorderable. ([projects](https://linear.app/docs/projects)) Those are Custom Views. They are not `Project.issues`.

Public read of that scope is thin:

- `CustomView.team` is public; null "if the view is workspace-wide **or scoped to a project/initiative instead**."
- There is **no** `CustomView.project` field.
- `CustomViewUpdateInput.projectId` is `[Internal]`.
- `Query.customViews`: "All custom views accessible to the user, including personal views and shared workspace views. **Excludes views scoped to a specific project or initiative.**"
- `CustomView.facet` is `[INTERNAL]`: "links this custom view to its parent entity (project, initiative, team page, etc.)."

Do not treat Facet as specified here (map fog). Product attachment and create-time `projectId` are enough to say: scoped-to-project Custom Views exist, live as tabs on the project, and are a different object from `Project.issues`.

A Custom View whose View Model is **Project** (`projectFilterData` set) lists Projects, not Issues. That is not "a view of a project's issues" at all.

### My Issues is an implicit Issue query, not a Custom View

Product: "My issues is a curated view" with four tabs — assigned, created, subscribed, activity. It lives in the sidebar under Inbox. `G` then `M`. ([my-issues](https://linear.app/docs/my-issues)) Assigned work, including work delegated to an agent, "appear in your My Issues default view." ([assigning-issues](https://linear.app/docs/assigning-issues))

There is no `MyIssues` type and no `CustomView` whose name is reserved for this page.

The matching API is viewer-relative Issue connections and filters:

| My Issues tab (product) | Public API |
| --- | --- |
| Assigned | `User.assignedIssues` ("Issues assigned to the user.") |
| Created | `User.createdIssues` ("Issues created by the user.") |
| Subscribed | no `subscribedIssues` connection; `IssueFilter.subscribers` + `NullableUserFilter.isMe` |
| Activity | not an Issue membership field |

[Filtering](https://linear.app/developers/filtering) uses `viewer { assignedIssues … }` and `viewer { createdIssues … }` as the examples of "issues assigned to me" / "created by me."

`enum ViewType` names the **page** View Preferences attach to, and includes `myIssues`, `myIssuesCreatedByMe`, `myIssuesSubscribedTo`, `myIssuesActivity`, `myIssuesSharedWithMe`. Those values sit next to `customView`, `allIssues`, `activeIssues`, `backlog`, `project`. Built-in pages are ViewType values, not Custom View records. (Confirmed in the Custom View finding.)

You *can* save an Issue Custom View with `filterData.assignee: { isMe: true }`. That is a Custom View that happens to match assigned-to-me. It is not My Issues: it has no four tabs, and Focus grouping is documented only for My Issues. ([display-options](https://linear.app/docs/display-options): "Focus is available in the My Issues view.")

Team Issues is the same kind of thing: `Team.issues` plus built-in Active / Backlog / Triage pages (`ViewType.activeIssues`, `backlog`, `allIssues`, `triage`; `ContextViewType` for notification context). Product: the Issues page "shows all issues across the selected team"; Active and Backlog are "default views within this page"; the Views page is where Custom Views for the team live. ([default-team-pages](https://linear.app/docs/default-team-pages); [teams](https://linear.app/docs/teams))

Other built-in Issue lists that are not Custom Views: label pages, user profiles, a comma-separated `/issues/ENG-123,ENG-456` URL (`ViewType.issueIdentifiers`). ([custom-views](https://linear.app/docs/custom-views))

### Custom View scoped to team vs workspace vs project

`CustomViewCreateInput` header: "Optionally scope the view to a team, project, or initiative."

| Scope | Create | On `CustomView` | Listing |
| --- | --- | --- | --- |
| Workspace | omit `teamId` / `projectId` / `initiativeId` | `team` is null (and not project/initiative scoped) | Included in `Query.customViews` |
| Team | `teamId` | `team: Team` | Included; `CustomViewFilter.team` |
| Project | `projectId` | **no `project` field**; `team` is null | **Excluded** from `Query.customViews` |
| Initiative | `initiativeId` | **no `initiative` field**; `team` is null | **Excluded** |

Product ([custom-views](https://linear.app/docs/custom-views)):

- Workspace-level shared views appear under Workspace views, available to full members.
- Selecting a team, project, or initiative at create time scopes the shared view to that entity; it is listed under Team views.
- "Contextual views" created from a team's Issues or Projects sections appear alongside that team's default views (All Issues, Active, Backlog), not only in the Views menu.
- Copying a URL does not grant access; the view must already be shared.

`CustomView.issues(includeSubTeams)` / `projects(includeSubTeams)` apply "when the custom view is associated with a team."

**Scope is not the filter.** `CustomView.team` is the view's home. `IssueFilter.team` further restricts issues inside an Issue view, including a workspace-wide one. Same split for project: create `projectId` is home; `IssueFilter.project` is membership. A workspace-wide view can filter to selected teams or to one project without becoming team- or project-scoped.

Sharing is a third axis: `shared: Boolean!` and `owner: User!`. Personal vs shared is not the same as workspace vs team vs project.

### Grouping and layout live on View Preferences

`CustomView` has no `grouping` or `layout` fields. It has:

- `organizationViewPreferences: ViewPreferences` — workspace default for this custom view, if set
- `userViewPreferences: ViewPreferences` — this user's overrides, if set
- `viewPreferencesValues: ViewPreferencesValues` — "computed … merging organization defaults with user overrides and system defaults. Use this for the effective display settings rather than reading raw preferences directly."

`ViewPreferences.preferences` holds "layout, grouping, sorting, and field visibility settings." `ViewPreferencesValues` fields that matter here: `layout` ("issue layout type"), `projectLayout`, `issueGrouping`, `issueSubGrouping`, `projectGrouping`, `viewOrdering`, plus show/hide and display-property flags. Types are `String` / `Boolean`, not GraphQL enums.

`ViewPreferences.viewType`: "board, cycle, project, customView, myIssues, etc." Create requires `type` (`organization` | `user`) and `viewType`. `customViewId` associates preferences with a Custom View. The same type also takes `teamId`, `projectId`, `labelId`, `userId`, … so built-in pages have preferences without a Custom View.

The schema type comment on `CustomView` says "a saved filter, sort, and grouping configuration." Trust the fields: sort and grouping are not on `CustomView`; they are on View Preferences. (The Custom View finding already locked this split.)

Product ([display-options](https://linear.app/docs/display-options)):

- Display options group, order, and switch list/board/timeline. They "can be saved as personal preferences or as the default display options on that page for your workspace."
- "This is different from filters; filters will refine the list to only issues with certain properties while display options show all issues in the list but hide or show data."
- My Issues has its own grouping, including Focus.
- Filters in the URL do not include "View options." ([filters](https://linear.app/docs/filters))

Filters answer **which rows**. Preferences answer **how those rows are shown**. Changing grouping does not change which Issues belong to a Project or match a Custom View. Changing `Issue.project` does not change anyone's layout.

## Inferences

1. **Ownership vs membership vs query vs display are four layers.** Team owns the Issue. Project membership is an optional edge on the Issue. Custom View membership is a saved filter over a View Model. Display is View Preferences on a page. Collapsing any two of those into one object is not Linear.
2. **`Project.issues` is the definition of "issues in this project."** A Custom View filtered to that project is a saved query that *reads* the same edge (`IssueFilter.project`). It does not replace the Project's list, and it does not have to live on the Project.
3. **Project-scoped Custom Views are still Custom Views.** Product "attached issue views" / "contextual views" are Custom View records with project (or team) scope. The built-in Issues tab is not one of them. The INTERNAL facet is the likely join; this note does not specify Facet.
4. **My Issues assigned ≈ `User.assignedIssues`, not `CustomView` + `assignee.isMe`.** The latter can approximate the set. The page, tabs, and Focus grouping are `ViewType.myIssues*`. Saving "assigned to me" as a Custom View creates a different object.
5. **Team Active / Backlog are implicit WorkflowState-type queries**, not Custom Views. Product: Active is unstarted + started; Backlog is the backlog category. ([default-team-pages](https://linear.app/docs/default-team-pages)) Same pattern as My Issues: built-in Issue query + View Preferences.
6. **Workspace Custom View + `IssueFilter.project` ≠ project-scoped Custom View.** The first appears in the Views list and can be shared workspace-wide. The second is a tab on the project and is omitted from `Query.customViews`.
7. **`ViewType.customView` vs `modelName`.** Preferences for a Custom View of Projects still use `viewType: customView` (plus `customViewId`). `ViewType.project` / `projects` are the built-in project *pages*. (Same inference as the Custom View finding; it is load-bearing for composition.)

## Unknowns

- Whether an Issue may belong to a Project whose `teams` does not include the Issue's Team. Schema and product do not say.
- Whether a project-scoped Custom View's `issues` connection is implicitly restricted to that project when `filterData` has no `project` clause, or whether create always writes `filterData.project`.
- How to **read** project/initiative association after create without INTERNAL `facet`. (Map already lists this.)
- Whether `CustomView.issues(filter:)` ANDs with saved `filterData` or replaces it. (Map already lists this.)
- Who may edit a shared view besides the owner; guest / private-team visibility of scoped views.
- Allowed **string values** for `issueGrouping`, `layout`, and the rest of `ViewPreferencesValues`. Product lists examples only. Focus as a grouping value is documented for My Issues; it is not a GraphQL enum member.
- Product My Issues has four tabs; `ViewType` also has `myIssuesSharedWithMe`. How that page relates to the documented tabs is unspecified here.
- Evaluation of saved `IssueFilter` JSON inside Linear.app (later ticket).
- Replica adoption (out of scope).

## Composition rules

1. An Issue belongs to exactly one Team (`Issue.team: Team!`) and at most one Project (`Issue.project: Project`).
2. A Project spans one or more Teams (`Project.teams`; create `teamIds`). Project membership does not move Issue ownership off the Team.
3. `Project.issues` is the project's own issue list. It is not a Custom View.
4. A Custom View filtered to a project is an Issue (or other) saved query whose **membership** names that project. It may be workspace- or team-scoped.
5. A Custom View **scoped** to a project is a different object: create `projectId`, no public `project` field, excluded from `Query.customViews`, product-attached as extra tabs on the project.
6. My Issues, Team All/Active/Backlog, and the Project Issues tab are built-in Issue queries (`ViewType`, plus `User.assignedIssues` / `Team.issues` / `Project.issues`). They are not Custom View records.
7. Custom View scope is workspace (omit), team (`teamId` / `CustomView.team`), project (`projectId`), or initiative (`initiativeId`). Scope is where the view lives. `IssueFilter.team` / `IssueFilter.project` are membership.
8. Grouping, layout, ordering, and display properties live on View Preferences (`organizationViewPreferences` / `userViewPreferences` → `viewPreferencesValues`). They attach to a Custom View **or** to a built-in page. They do not live on Issue, Project, or Custom View.
9. Filters change which rows match. Preferences change how matching rows are shown. Display options are not filters. ([display-options](https://linear.app/docs/display-options); [filters](https://linear.app/docs/filters))

## Informational delta vs this replica

Not an adoption decision. Replica: `src/types.ts`, `src/logic.ts` `matchesView` / `groupIssues`, `src/App.tsx` `visible`.

| | Linear | Replica |
| --- | --- | --- |
| Issue → Team | `team: Team!` | `teamKey: string` |
| Issue → Project | optional `project: Project` | optional `projectId` (same shape of edge) |
| Project's issue list | `Project.issues`; built-in Issues tab | `issues.filter(projectId === project.id)` in UI; no connection on `Project` |
| Attached views on a project | Custom Views scoped to the project, extra tabs | no attached views; `ProjectTab` is overview / activity / issues only |
| My Issues | built-in `ViewType.myIssues*`; `User.assignedIssues` / `createdIssues` | `NavId` `"my-issues"` with assigned / created / subscribed / activity tabs (right kind of object) |
| "Assigned to me" as a Custom View | a *separate* saved query, if someone creates one | seed Custom View `assigned` with `assignedToMe: true` **and** My Issues — two objects approximating one Linear page |
| Custom View scope | workspace / team / project / initiative | optional `teamKey` only |
| Filter vs scope | `filterData.project` vs create `projectId` | `CustomViewFilter.projectId` is only a membership flag |
| Grouping / layout | View Preferences, also on My Issues / Project / Team pages | `grouping` and `layout` **on** `CustomView`; My Issues grouping falls back to `activeView?.grouping ?? "status"` |
| View Model | derived; Issue view of a project ≠ Project view | stored `modelName`; `matchesView` only handles `"Issue"` |

Replica `visible` already treats the three surfaces as different branches (`nav === "views"` / `"projects"` / `"my-issues"`). That split matches Linear's composition. What it flattens is scope, attached project views, and the View Preferences record.

# How Linear evaluates a Custom View filter

Ticket: [How Linear.app evaluates a Custom View filter](https://github.com/xxh171015/linear-style/issues/6)
Map: [Spec Linear Issue, Project, and Custom View product logic](https://github.com/xxh171015/linear-style/issues/1)

This note answers: how the Linear **hosted** client decides that a set of Issues (or Projects) matches a Custom View — local vs server evaluation, how `filterData` is interpreted, where grouping/layout apply, and where replica `matchesView` is too small. It does not adopt a replica subset. It does not quote Linear source.

Prior tickets this depends on:

- [Locate Issue, Project, and Custom View logic in Linear.app](https://github.com/xxh171015/linear-style/issues/2): Linear.app 1.32.8 is an Electron shell; product JS is `https://linear.app`, not `app.asar`.
- [Reconstruct Linear's Custom View model from the public GraphQL API](https://github.com/xxh171015/linear-style/issues/5): membership is typed `*FilterData`; layout/grouping live on View Preferences.

## Gist

A Custom View's **membership** is the saved comparator tree (`filterData` / `projectFilterData` / `initiativeFilterData` / `feedItemFilterData`). The **public GraphQL API** evaluates that tree on the server: `CustomView.issues` / `.projects` / `.initiatives` / `.updates` return the matching connection using the [Filtering](https://linear.app/developers/filtering) language.

The **hosted client** (what Linear.app loads at `/auth/desktop`) also evaluates the same JSON **locally**. It compiles the tree into a `FilterMatcher` (`simplifyFilter` → `optimizedModelMatcher` → `compileElementMatcher` / `matchElement`) and runs it over a hydrated model collection. When the collection is too large, a **server-backed hydrator** (`hydrateFromServer`, `isServerBacked`, `hasTooManyIssues`) asks the server for a filtered subset. Grouping, layout, ordering, and "show completed / triage / sub-issues" are **not** membership: they run afterwards in a list provider, from View Preferences.

Replica `matchesView` is a local boolean over a seven-field flat filter, Issue-only. It is not that matcher, and it is not the GraphQL connection.

## Method

- Did **not** treat `app.asar` as the filter engine (issue 2).
- Linear.app 1.32.8 was already running. Renderer command line includes `--linear-desktop-state` with `host` `https://linear.app` and `version` `1.32.8`. No `--remote-debugging-port`. Loopback `127.0.0.1:44450` is the desktop helper named in the page CSP (`connect-src`); `GET /json/version` returns HTTP 400. REA `list_electron_targets` on that port: `invalid_endpoint_response`. No CDP attach. **No logged-in session was driven.**
- Public `GET https://linear.app/auth/desktop` (unauthenticated) returns the product shell HTML, which modulepreloads `https://static.linear.app/client/assets/*`. Marketing `https://linear.app/` is a different Next.js tree (`/web/_next/`) and was not used.
- Downloaded the eager bootstrap JS. Identifier inventory on those bytes (names only). REA `analyze_javascript_application` on a local copy of that tree. String-seed `trace_application_feature` on the truncated semantic graph returned no-match (same limitation as issue 2: bytes can exist and still miss the graph). Module-path seed of `assets/startup-entry.DwaRibR9.js` matched and exceeded the MCP transport budget; retained as `ev_b912d0cedc1a6276ddbeefd996be385bef30b35a7a7686fe5edabce2b8e14aff`.
- Public GraphQL schema pinned by issue 5 (`linear/linear` `packages/sdk/src/schema.graphql` @ `8397645`) and [Filtering](https://linear.app/developers/filtering), [Custom Views](https://linear.app/docs/custom-views), [Filters](https://linear.app/docs/filters.md), [Display options](https://linear.app/docs/display-options).
- Replica `src/logic.ts` `matchesView` / `groupIssues` and `src/App.tsx` as informational delta only.

Static analysis does not prove runtime execution. Where a conclusion depends on identifier co-location plus public schema, it is marked **inference**.

## Identity

| Field | Value | Authority |
| --- | --- | --- |
| Desktop shell | Linear.app 1.32.8, `host` `https://linear.app` | running renderer `--linear-desktop-state`; issue 2 |
| Product HTML | `https://linear.app/auth/desktop` | unauthenticated GET, 200, `x-robots-tag: noindex` |
| Product assets | `https://static.linear.app/client/assets/` | `<link rel=modulepreload>` on that HTML |
| Client build | `BUILD_REVISION` 85490, `CLIENT_VERSION_HASH` `afa4949b3e5e7769f7b2`, `SHORT_SHA` `ad542b580d1`, `PR_NUMBER` 102647, `DEPLOYED_AT` `2026-11-02T01:44:57+0000` | inline `__RELEASE_INFO` on `/auth/desktop` |
| Filter engine file | `startup-entry.DwaRibR9.js` (3 010 217 bytes) | SHA-256 `608da788180d55ef39dae8819bd9cb2d6338f5994aed4d4e5df87b1657700337` |
| List/UI file | `startup-root.DE6adwa4.js` (6 725 977 bytes) | SHA-256 `43212f9ed926901c068d3e2b755b53a48a67d7fde877ae56292b86c0188bfa09` |
| Boot / flags / endpoints | `startup-boot.p2FopT6S.js` (65 358 bytes) | SHA-256 `555d619a8b006af76d71e1d9dd44cb587e5eb0a6400e4f2f35b31cb48ad4a67d` |
| REA tree digest | `578e3740a549e113f40eb052e877c230b1d1761d0dcd635926f9c4411bdcd25d` | `analyze_javascript_application` |
| Source maps | not published next to the JS | `GET *.js.map` → 404 |
| GraphQL schema | `linear/linear` @ `8397645` | issue 5 |

The desktop **shell** version (1.32.8) and the **hosted** client build (revision 85490, deployed 2026-11-02) are independent. Linear.app loads whatever `linear.app` currently serves. This note describes that hosted build, not a frozen copy inside the asar.

## Observations

### Server membership (public API) — known

Schema field `CustomView.issues`:

> Issues matching the custom view's issue filter. Returns an empty connection if the view's modelName is not "Issue".

Same pattern for `projects` / `initiatives` / `updates`. Each connection also takes an extra `filter:` of the matching `*Filter` type, plus `includeArchived`, `includeSubTeams` (issues default `false`, projects default `true`), pagination, and INTERNAL `sort`.

[Filtering](https://linear.app/developers/filtering) is the comparator language those filters use: default logical **and** of fields, `or` / `and` compounds, relationship filters, `eq` / `neq` / `in` / `nin`, numeric/date `lt`/`lte`/`gt`/`gte`, string `contains` / `startsWith` / `*IgnoreCase`, `null`, relative ISO-8601 durations, collection `every`. [Getting started](https://linear.app/developers/graphql) states this GraphQL API is the same API Linear uses internally.

Create/update take typed `IssueFilter` / `ProjectFilter` / … and store them as `JSONObject` `*FilterData` (issue 5).

That is **server membership**: the API returns the entities that match the saved tree. How an extra `CustomView.issues(filter:)` combines with saved `filterData` is still not stated by the schema ("Filter returned issues").

### Hosted client: local compiled matcher

`startup-entry.DwaRibR9.js` contains a matcher whose recovered identifiers (byte inventory, not a source dump) include:

| Identifier | Role (from co-located names) |
| --- | --- |
| `FilterMatcher` / `compiledFilterMatcher` | compiled predicate |
| `compileFilterMatcher` | compile entry |
| `simplifyFilter` / `simplifyFilterRec` / `simplifyFilterCache` | normalize the JSON tree (`isAndFilter` / `isOrFilter` / `NEVER_MATCHING_FILTER`) |
| `rawModelMatcher` / `optimizedModelMatcher` | matcher with `sharedComparatorOverrides` |
| `compileElementMatcher` / `compileElementMatcherInternal` / `matchElement` | per-element / per-comparator evaluation |
| `filterElement` / `filterElements` / `filterNotElements` | collection apply |
| `isMatchingAllFilters` / `isMatchingAnyFilters` / `isFiltering` | and / or / active |
| `comparatorCompilers` / `comparatorOverrides` | comparator table |
| `issueUniversalCollectionFilter` / `projectUniversalCollectionFilter` / `initiativeUniversalCollectionFilter` / `feedItemUniversalCollectionFilter` | wrap saved `*FilterData` plus `filterTransformers` |
| `applyFilters` / `applyOrder` | `ReadonlyCollection` pipeline |

Comparator identifiers next to `compileElementMatcher`: `eqIgnoreCase`, `neq`, `neqIgnoreCase`, `lte`, `gte`, `before`, `and`, `every`, `some`, `null`, `isDuration`, `addDuration`, `toTimelessDate`. Override identifiers next to `rawModelMatcher`: `sharedComparatorOverrides`, `teamComparatorOverride`, `initiativeAncestorsComparatorOverride`, `creatorAsksFallbackComparatorOverride`, `sourceMetadataComparatorOverride`, `reviewerUsersComparatorOverride`, plus label modes `any` / `neither`.

`isMe` is present (78 hits in this file). That is the public `NullableUserFilter.isMe` comparator, not the replica's `assigned: boolean`.

Custom View model identifiers in the same file: `issueFilterData` / `filterData` / `projectFilterData` / `initiativeFilterData` / `feedItemFilterData` on create; getters `issues` / `projects` / `initiatives` that `filter` `issueHydrator.models` (or the project/initiative equivalents) through the matching `*UniversalCollectionFilter` constructed `new filterData filterTransformers`.

`IndexedDB` appears in boot and entry. Boot also names `client-api.linear.app`, `sync.linear.app`, and `api.linear.app/graphql`. CSP `connect-src` on `/auth/desktop` lists those plus `wss://sync.linear.app/`. The running Linear user-data directory has `IndexedDB/https_linear.app_0.indexeddb.leveldb` (existence only; contents not read).

### Hosted client: server-backed hydration when local is not enough

Same file, next to the Custom View hydrator:

| Identifier | Role (from co-located names) |
| --- | --- |
| `hydrateIssues` / `hydrateModels` / `hydrateFromServer` | fill the collection |
| `hasTooManyIssues` / `hasTooManyModels` | local collection too large |
| `isServerBacked` / `forceServerBacked` / `forceServerRehydration` | take the server path |
| `serverHydrationStatus` / `afterCachedServerHydration` | hydration state |
| `perFilterCache` / `lastServerIssueCount` / `collectionIsComplete` | cache / completeness |
| `overlayFilters` | extra predicates sent with the base filter |
| `combineModelFilters` | AND-merge (`prepareFilterForMerging`) |
| `getAdditionalServerBackedViewSettings` | extras from `viewPreferences` |
| `simplifyServerBackedViewFilters` | optional `simplifyFilter` before send |
| `maxIssuesOverride` / `errorOnLimitExceeded` / `hiddenByLimit` | caps |
| `hiddenByFilters` / `hiddenByDisplayOptions` | separate hide buckets |
| `hasHydratedClientBackedCustomViewIssues` | name that distinguishes the local path |

`computeFilters` co-locates `baseFilter`, `overlayFilters` of `universal` / `insights` / `quick`, `combineModelFilters` `and`, optional `simplifyServerBackedViewFilters` `simplifyFilter`, and `customView` / `project` / `team` `withAccessibleDescendants`.

Boot flag key `simplify-server-backed-view-filters`: title "Simplify server backed view filters"; description "Run custom filter through simplifyFilter before sending for views"; `defaultValue:!1` (false).

`serverBackedList` sits in the layout enum next to `list`, `board`, `split`.

`startup-root.DE6adwa4.js` has GraphQL operations `SearchIssuesByFilter` (`$filter IssueFilter`), `SearchProjectsByFilter`, `SearchAllByFilter`, `SearchCustomViewsByFilter`. Those are search-by-filter operations, not the Custom View page itself. `query CustomViewHasSubscribers` is notification bookkeeping.

### Display is after membership

Issue 5 locked membership vs View Preferences at the API. The hosted client has a list provider whose recovered pipeline names are, in order:

`preFilteredModels` → `orderedModels` → `universalFilteredModels` → `insightsFilteredModels` → `quickFilteredModels` → `filteredModels` → `allGroupDefinitions` / `computedGroups` → `boardOrderedFilteredModels` / `boardItemRows`

`ModelListProvider` records debug steps around `quickFilteredModels` / `isFiltering`. `readFilterFromUrl` sits next to `noUniversalFilter`, `emptyFilterWhenUrlParamMissing`, `filterTransformer` — URL query as a filter overlay, matching [Filters](https://linear.app/docs/filters.md) ("applied filters are also reflected in the browser URL"; display options are not).

View Preferences identifiers in entry/root match the public `ViewPreferencesValues` fields: `issueGrouping`, `issueSubGrouping`, `layout`, `projectLayout`, `viewOrdering`, `viewOrderingDirection`, `showCompletedIssues`, `showSubIssues`, `showTriageIssues`, `showEmptyGroups` (+ board/list variants), `showSubTeamIssues`, `closedIssuesOrderedByRecency`. Schema types `showCompletedIssues` as **String** ("Whether completed issues are shown and for how long"); client preference values co-located with it include `all`, `day`, `completedCycle`. `showSubIssues` / `showTriageIssues` / `showEmptyGroups` are booleans on the public type.

[Display options](https://linear.app/docs/display-options): display options "hide or show data on the issue item" and are "different from filters". Client count math keeps `hiddenByFilters` and `hiddenByDisplayOptions` as separate terms, which matches that split.

`combineFilters` / `filtersCanBeCombined` is the save-view path: merge current overlays into `filterData` / `projectFilterData` / … (`canManageCustomView`). That writes membership. It does not write grouping.

### Product docs that match the split

- [Custom Views](https://linear.app/docs/custom-views): a view is a saved filtered list of issues, projects, or initiatives; URL may include **temporary** filters; sharing a link does not grant access.
- [Filters](https://linear.app/docs/filters.md): filters refine lists and create Custom Views; advanced AND/OR; operators is / is not / is either of / includes any|all|neither; API details deferred to developer filtering docs.
- [Display options](https://linear.app/docs/display-options): grouping/layout/ordering/display properties; issue list vs board; not filters.

## Inferences

1. **Two evaluators, one tree.** The saved `*FilterData` JSON is the IssueFilter (or ProjectFilter / …) comparator tree. The public API evaluates it on the server as `CustomView.issues` (etc.). The hosted client compiles the same JSON and matches local models. They are specified to be the same language; this session did not prove they are bitwise identical on every comparator (see Unknowns).
2. **Local-first, server-backed when the replica is incomplete.** Custom View `issues` on the client is a filtered view of `issueHydrator.models`. `hydrateFromServer` runs when `hasTooManyIssues` / `isServerBacked`. The server request sends `baseFilter` AND-merged with overlay filters (universal / insights / quick), not grouping. `hasHydratedClientBackedCustomViewIssues` names the complementary path.
3. **Overlays are extra membership, not display.** Universal (the saved view), insights, quick filters, and URL filters all feed `filteredModels`. Grouping/layout consume `filteredModels` and View Preferences. `hiddenByFilters` vs `hiddenByDisplayOptions` is that cut in counts.
4. **`filterTransformers` rewrite the tree before matching** (current user, team scope, `__myTeams__`, and similar). Replica `matchesView` has no such step; it compares booleans already stored on the issue.
5. **`SearchIssuesByFilter` is not the Custom View engine.** It is a GraphQL search. The view page's local engine is `FilterMatcher` + hydrator. The public `CustomView.issues` connection remains the server membership API for integrations.

## Unknowns

- Runtime: which path a given open view actually takes (`client-backed` vs `server-backed`), the numeric `hasTooManyIssues` threshold, and `hydrationLimit`. No CDP, no logged-in session.
- Whether client `matchElement` and server `CustomView.issues` agree on every comparator, duration, and relationship `every`/`some`. Static names match the public language; parity is unproven.
- Whether `CustomView.issues(filter:)` **AND**s with saved `filterData` or **replaces** it (still unspecified in the schema; client `combineModelFilters` AND-merges overlays, which is a related but different operation).
- Exact semantics of each `*ComparatorOverride` (team, labels `any`/`neither`, ancestors, creator fallback).
- Lazy chunks (`import('./lazy.…')` and friends) were not downloaded. The matcher and hydrator identifiers are in the eager `startup-entry` bundle.
- REA string-seed traces for `FilterMatcher`, `compileFilterMatcher`, `hydrateFromServer`, `issueUniversalCollectionFilter`: **no-match** on the truncated semantic graph. Do not treat that as absence; the bytes are in `startup-entry.DwaRibR9.js`. Semantic coverage: `max_semantic_nodes_per_file` 20000 on a 3 MB / 6 MB pair; 40926 semantic unknowns retained.
- How `includeSubTeams` on the GraphQL connection interacts with client `withAccessibleDescendants` / `showSubTeamIssues`.
- Manual order vs `viewOrdering` (product: manual order is workspace-global; not fully mapped here).
- FeedItem / Initiative matching beyond the existence of the parallel `*UniversalCollectionFilter` names.

## Informational delta vs replica `matchesView`

Not an adoption decision. Replica: `src/logic.ts` `matchesView` / `groupIssues`; `src/types.ts` `CustomView` / `CustomViewFilter`; `src/App.tsx` visible-issue memo.

```91:102:src/logic.ts
export function matchesView(issue: Issue, view: CustomView): boolean {
  if (view.modelName !== "Issue") return false;
  const filter = view.filter;
  if (filter.assignedToMe && !issue.assigned) return false;
  if (filter.createdByMe && !issue.created) return false;
  if (filter.subscribed && !issue.subscribed) return false;
  if (filter.statuses?.length && !filter.statuses.includes(issue.status)) return false;
  if (filter.projectId && issue.projectId !== filter.projectId) return false;
  if (filter.labels?.length && !filter.labels.some((label) => issue.labels.includes(label))) return false;
  if (filter.priority !== undefined && issue.priority !== filter.priority) return false;
  return true;
}
```

`App.tsx` then applies a status chip and `showCompleted` **outside** `matchesView`, and `groupIssues(visible, activeView?.grouping ?? "status")` using grouping stored **on** `CustomView`.

| | Linear hosted client + public API | Replica `matchesView` |
| --- | --- | --- |
| Where membership runs | Server: `CustomView.issues` / `.projects` / … . Client: compiled `FilterMatcher` on hydrated models, with `hydrateFromServer` when too large | One local boolean in the React tree |
| Filter object | IssueFilter (and Project/Initiative/FeedItem) comparator tree: `and`/`or`, relationship filters, `eq`/`in`/`contains`/…, `isMe`, durations | Flat `CustomViewFilter`: seven optional fields |
| Models | Four View Models; empty connection / other getter when `modelName` does not match | `modelName !== "Issue"` → `false`; no Project matcher |
| Labels | collection comparators (`any` / `neither` / `every` / `some`) | `some` overlap only |
| Assignee / creator / subscriber | `NullableUserFilter` (`isMe`, nested user fields) | booleans `assigned` / `created` / `subscribed` already on the issue |
| Dates, relations, team, cycle, state type | present in IssueFilter and in the matcher identifier set | absent |
| Overlays | universal + insights + quick + URL (`readFilterFromUrl`); AND-merged for server hydration | none |
| Transformers | `filterTransformers` before match | none |
| Too-large views | `hasTooManyIssues` → server hydrator | N/A (seed list) |
| Grouping / layout | View Preferences after `filteredModels`; `hiddenByDisplayOptions` separate from `hiddenByFilters` | `grouping` / `layout` fields on `CustomView`; `groupIssues` after match; `showCompleted` is a separate UI boolean |
| `showCompletedIssues` | preference **String** (how long completed stay visible) | boolean hide done/canceled in `App.tsx` |
| Layout values | `list` / `board` / `split` / `serverBackedList` (client enum identifiers); product docs list/board (issues), list/board/timeline (projects) | `list` \| `board` |

`matchesView` is too small in **language** (flat flags vs comparator tree), **surface** (Issue-only, no overlays, no transformers), **evaluation site** (no server connection, no hydrator), and **display split** (grouping/layout live on the view object instead of View Preferences applied after membership).

## Evidence IDs

| ID | Operation | What it supports |
| --- | --- | --- |
| `ev_b12fbb49db045d311b213e964c3673f739e32ebdf9fa189717361ad65fc107b1` | `analyze_javascript_application` (parent) | Hosted client tree; 3 selected JS sources parsed; semantic graph truncated |
| `ev_13b1bf14022ed7afe711b90e91b675c0d3fada33ba6b22d97bbb4bf39b8aa4d3` | analysis-view summary of the above | 12 relevant files, 3 parsed JS, 9 unselected, 2 444 360 AST nodes, partial semantics |
| `ev_58f5130ab0927ecb48baab5281537cdda56d1059e37a5cf2406dc349efb52cb4` | javascript-facts (page) | Minified export recovery on the three selected files; not the FilterMatcher name |
| `ev_db25b66a95f4958129bf98a48fcf8453dead39642bec4fe75c887ef0a9963888` | `trace_application_feature` `FilterMatcher` | no-match on truncated graph (bytes still in startup-entry) |
| `ev_10da502002b82ba662e56c137aa3c2de76de2b52089c131c29b99ff69ced01c9` | trace `compileFilterMatcher` | no-match (same caveat) |
| `ev_72c0bd7f24f343eba80fd0901db3d70f1abbe12d36fa8c220c1cecd1287d3170` | trace `hydrateFromServer` | no-match (same caveat) |
| `ev_881abf14609dfe02b48d8196d3a34b2c8cd7d6b47e61e1cb9721c2806ac26bbf` | trace `issueUniversalCollectionFilter` | no-match (same caveat) |
| `ev_b912d0cedc1a6276ddbeefd996be385bef30b35a7a7686fe5edabce2b8e14aff` | trace module `assets/startup-entry.DwaRibR9.js` | matched; MCP response exceeded 10 MiB (retained, not inlined) |

Issue 2 asar evidence is not reused as a filter-engine source. Public schema / filtering docs are cited by URL, not as REA IDs.

## Coverage

- Hosted HTML: one unauthenticated `/auth/desktop` response.
- Eager JS: complete download of the ten modulepreload + entry files; identifier inventory complete for those bytes.
- Lazy chunks: not fetched.
- REA parse: complete for the three selected sources; 9 inventoried files unselected (vendors, tiny loaders, HTML).
- Semantic graph: partial/truncated (`max_semantic_nodes_per_file` 20000). String-seed traces therefore no-match; identifier inventory is the authority for matcher names.
- Runtime evaluation: not observed (no CDP, no login).
- Public GraphQL membership fields: complete relative to the pinned schema.
- Replica delta: `matchesView`, `groupIssues`, and the `App.tsx` visible-issue memo.

## What this ticket is not

Not a replica adoption decision. Not a dump of Linear source or minified JavaScript. Not a proof that client and server matchers are identical. Not a spec of Facet, notifications, or View Preferences string enums (those remain map fog / issue 5 unknowns). Not an asar re-analysis.

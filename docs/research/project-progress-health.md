# How Linear computes Project progress and health

Ticket: [How Linear.app computes Project progress and health](https://github.com/xxh171015/linear-style/issues/7)
Map: [Spec Linear Issue, Project, and Custom View product logic](https://github.com/xxh171015/linear-style/issues/1)

This note answers one question: how Linear computes Project **progress** versus **health**, in the public GraphQL API and in the hosted client that Linear.app 1.32.8 loads. It confirms or corrects replica `projectScope` in `src/logic.ts`. It does not adopt replica behavior. It does not quote Linear source.

Prior findings this ticket verifies rather than replaces: [Reconstruct Linear's Project model from the public GraphQL API](https://github.com/xxh171015/linear-style/issues/4) (`docs/research/project-graphql-model.md` on `research/project-graphql-model`) already documented the public progress formula and health-from-update split. [Locate Issue, Project, and Custom View logic in Linear.app](https://github.com/xxh171015/linear-style/issues/2) established that product JS is `https://linear.app`, not `app.asar`.

## Gist

Progress and health are different axes. **Progress** is estimate-point arithmetic over the Project's Issues: `(completed + 0.25 × started) / live scope`. **Health** is whatever the latest Project update reported (`onTrack`, `atRisk`, `offTrack`) and is not derived from progress or from Project status.

Replica `projectScope` **matches the 0.25 formula, canceled-out-of-scope, unestimated = 1 as the usual default, and empty live scope → 0**. It is **not** a full match: Linear also drops triage and duplicate from live scope; unestimated Issues use the Issue's Team `defaultIssueEstimate` when estimates are on (default 1, not a hardcoded 1); the hosted client caps a not-quite-done Project at 0.999 / 99%; a completed Project with empty scope displays as 1. Replica **milestone** math (completed count / live count) is a different measure from Linear, which applies the same 0.25 estimate formula to the Milestone's Issues.

## Method

- Public schema and first-party docs first (same owning sources as the Project GraphQL ticket). Fetched 2026-11-02.
- Hosted client without a logged-in session: `https://linear.app/auth/desktop` (and `/login`) preload the product bundle from `https://static.linear.app/client/assets/`. Formula and health overlay live in that bundle, not in `app.asar`.
- REA `analyze_javascript_application` on a local copy of those assets (bootstrap files + `startup-entry.js`). Static parse only; the bundle was not executed. No Electron CDP session, no login.
- Replica `src/logic.ts` `projectScope` / `milestoneStats` is the comparison target, not a source for Linear's rules.

Do not treat `app.asar` as the engine.

## Sources

| Source | Role |
| --- | --- |
| [linear/linear `packages/sdk/src/schema.graphql`](https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql) (`master`, fetched 2026-11-02) | Owning comments for `Project.progress`, `Cycle.progress`, `Project.health`, `ProjectMilestone.progress` / `status`, Team estimate fields |
| [Project graph](https://linear.app/docs/project-graph) | ¼ in-progress remaining-points, canceled reduces scope, unestimated = 1 when estimates are off |
| [Cycle graph](https://linear.app/docs/cycle-graph) | Same 25% started rule with a count example; team default for unestimated; issue-count fallback |
| [Issue properties — Estimates](https://linear.app/docs/issue-property) | Unestimated default 1, disable that default, estimates-off → 1 point per issue, T-shirt → Fibonacci |
| [Initiative and project updates](https://linear.app/docs/initiative-and-project-updates) | Health is chosen on a Project update; 2% progress-report threshold; Update missing / No update expected |
| [Project milestones](https://linear.app/docs/project-milestones) | Milestone progress starts counting at started, then completed; yellow focus on the next incomplete Milestone |
| [Parent and sub-issues](https://linear.app/docs/parent-and-sub-issues) | Sub-issues inherit the parent's Project |
| Hosted client `https://linear.app/auth/desktop` → `https://static.linear.app/client/assets/startup-entry.DwaRibR9.js` | Client completion ratio, estimate helper, health-with-age overlay, Milestone status derivation |
| Replica `src/logic.ts` | `projectScope`, `milestoneStats` — comparison only |

Hosted client identity (from the `/auth/desktop` HTML, 2026-11-02): `BUILD_REVISION` 85490, `CLIENT_VERSION_HASH` `afa4949b3e5e7769f7b2`, `SHORT_SHA` `ad542b580d1`, `DEPLOYED_AT` `2026-11-02T01:44:57+0000`. Asset `startup-entry.DwaRibR9.js` SHA-256 `608da788180d55ef39dae8819bd9cb2d6338f5994aed4d4e5df87b1657700337` (3 010 217 bytes). Linear.app 1.32.8 was running locally as the Electron shell; it was not used as a logged-in REA target.

## Observations

### Public API: progress is a read-only Float from Issues

Schema comment on `Project.progress: Float!`: "The overall progress of the project. This is the (completed estimate points + 0.25 * in progress estimate points) / total estimate points."

`Cycle.progress: Float!` is the same arithmetic, plus two sentences Project omits: the value is between 0 and 1, and it returns 0 if no estimate points exist.

`Project.scope: Float!` is "The overall scope (total estimate points) of the project." Weekly histories (`scopeHistory`, `completedScopeHistory`, `inProgressScopeHistory`) sit next to it. Internal `currentProgress` is "broken down by issue status category."

None of `progress`, `scope`, or the histories appear on `ProjectCreateInput` / `ProjectUpdateInput`.

`Issue.estimate` is nullable. Team `issueEstimationType` is `"notUsed" | "exponential" | "fibonacci" | "linear" | "tShirt"`. `defaultIssueEstimate: Float!` is "What to use as a default estimate for unestimated issues." `issueEstimationAllowZero` is a separate flag. WorkflowState `type` is `"triage" | "backlog" | "unstarted" | "started" | "completed" | "canceled" | "duplicate"`.

Product graph FAQ: canceling or removing Issues reduces scope; when estimates are off, every Issue is 1 point. Product estimates page: by default unestimated Issues count as 1, and that default can be turned off; when estimates are not enabled, statistics use 1 point per Issue. Cycle graph: scope uses estimate points including the team default for Issues without an explicit estimate, or falls back to issue count.

### Public API: health is from the latest Project update

Schema comment on `Project.health: ProjectUpdateHealthType`: "The overall health of the project, derived from the most recent project update. Possible values are onTrack, atRisk, or offTrack. Null if no health has been reported."

`healthUpdatedAt` is "typically when a new project update is posted." `lastUpdate` is that update.

```
enum ProjectUpdateHealthType { atRisk, offTrack, onTrack }
```

`ProjectUpdate.health` is the health **at the time this update was posted** (`ProjectUpdateHealthType!`). Create input `health` is optional; `projectId` is required. `projectUpdate` (the Project mutation) does not accept `health`.

Product: the author picks On track / At risk / Off track on the update. Progress details in a draft appear when overall progress changed by more than 2% since the last update. Reminders go to the Project lead while status type is started ("In Progress").

Filter overlay, not a stored health enum: `ProjectFilter.healthWithAge` compares `onTrack, atRisk, offTrack, outdated, noUpdate`. Product labels: "Update Missing" when the last update was On Track and an update is one reminder cycle + 3 days overdue; "No Update expected" if completed or reminder schedule is Never.

### Hosted client: same 0.25 ratio, with membership rules the schema comment leaves out

The product bundle that `/auth/desktop` preloads contains a shared completion helper used by Project, Milestone, and Cycle.

**Buckets.** Each Issue contributes its estimate to a WorkflowState `type` bucket: triage, backlog, unstarted, started, completed, canceled, duplicate. Scope is the sum of those buckets.

**Estimate per Issue.** If the Issue's Team `issueEstimationType` is `notUsed`, the point value is 1. Otherwise it is `estimate` when set, else that Team's `defaultIssueEstimate`. The Team model's default for `defaultIssueEstimate` is 1.

**Ratio.** Live denominator = scope estimates minus canceled minus duplicate minus triage. Numerator = `1 × completed` + `0.25 × started`. Backlog, unstarted, triage, canceled, and duplicate have multiplier 0. If that live estimate denominator is 0, the helper retries with issue **counts** in the same buckets (the estimates-off / all-zero-default case). If still 0, the ratio is 0. The ratio is capped at 1.

**Almost-done cap.** If the ratio would be 1 while any started, unstarted, or backlog Issues remain, the helper returns 0.999. Percent display is `round(ratio × 100)`, except a rounded 100 with ratio ≠ 1 becomes 99.

**When the client recomputes.** If the Project's Issues are hydrated, progress is this helper over those Issues combined with `currentProgress.archivedProgress` from the server. If not hydrated, it uses the server `currentProgress` snapshot through the same helper. A completed Project whose live scope is empty is shown as 1 rather than 0.

**Clones.** The Issue list used for the live summarize step drops ORM clones (`isClone`), not sub-issues. Sub-issues inherit the parent's Project, so a parent and its sub-issues that all sit on the Project all enter the summarize step.

Public `Project.progress` remains a server field. The hosted client does not invent a different formula; it reapplies the same 0.25 arithmetic locally when Issues are available.

### Hosted client: health overlay on top of the stored value

`Project.health` and `healthUpdatedAt` are synced fields (`persistence: none` on the client model). The client does not compute onTrack/atRisk/offTrack from Issues.

A separate **health-with-age** value is derived for filters and icons:

| Stored health | Overlay |
| --- | --- |
| `onTrack`, `atRisk` | `outdated` ("Update missing") when the Project is active (status type `started`) and the update is stale; `noUpdate` ("No update expected") when it is not active and stale |
| `offTrack` | stays `offTrack` while the Project is active, even if stale; `noUpdate` if not active and stale |
| none | `outdated` if active with a reminder cadence; else `noUpdate` |
| done (completed or canceled) and stale | `noUpdate` |

Stale, weekly cadence: age in days ≥ `frequency × 7 + 3` (one weekly cycle plus 3 days), matching the product "one reminder cycle + 3 days" text. Daily cadence uses `frequency + 1`. A "slightly outdated" dashed outline uses `frequency × 7 + 1` on weekly. Reminder frequency 0 (Never) yields `noUpdate` when the Project is not active.

These overlay strings are the `healthWithAge` filter values. They are not members of `ProjectUpdateHealthType`.

The 2% rule for showing progress details on a Project-update draft is a client comparison of successive progress percents (`abs(a − b) > 2`).

### Milestones: same progress formula; status is a derived four-way

`ProjectMilestone.progress: Float!` is "The progress % of the project milestone." Create/update inputs cannot set `progress` or `status`.

Product: "Progress starts counting the moment an issue moves to a started status, and increases further once it's completed." That is the 0.25-then-1 behavior, not completed-count-only.

The hosted client runs the **same** completion helper on the Milestone's non-clone Issues (plus archived snapshot). Display is `progressPercent` from that 0..1 ratio.

`ProjectMilestoneStatus` is derived, not stored by the author:

1. If `targetDate` is in the past and progress ≠ 1 → `overdue`.
2. Else if this Milestone is the first in the Project order whose progress < 1 → `next` (the yellow-focus Milestone).
3. Else if progress ≠ 1 → `unstarted`.
4. Else → `done`.

So Milestone **completion** is not a distinct arithmetic. It is the Project 0.25 formula, scoped to that Milestone's Issues. The distinct rule is **status** (`next` / `overdue` / `unstarted` / `done`), not the percent.

### Project graph is related, not the same field

The project graph remaining-points text uses the same ¼ modifier for in-progress Issues. Graphs start after the Project is in a started status, update hourly, and are weekly. That is prediction/history, not `Project.progress`. Velocity weighting of recent weeks and ±40% prediction bands are graph-only.

## Inferences

1. **Public `Project.progress` and hosted-client completion share one formula.** Schema text, Cycle's extra 0..1 / empty-total sentences, and the client helper agree on `(completed + 0.25 × started) / live total` with empty total → 0 and a cap at 1.
2. **"In progress" means WorkflowState type `started`, not the display name "In Progress".** The client buckets by `state.type`. Replica `status === "progress"` is the right *category* only because this replica collapses started to that one status.
3. **Live scope is not "all Issues".** Canceled, duplicate, and triage are in the raw scope then subtracted. Product graph FAQ only names canceled/removed. The client is stricter.
4. **Unestimated = 1 is the default default, not an unconditional rule.** Estimates off → 1. Estimates on → `estimate ?? defaultIssueEstimate` (Team default 1). Turning off "unestimated count as 1" is the Team default going to 0, which then falls through to the count-based retry when every live estimate is 0.
5. **Health cannot drift with Issue movement.** Progress can go from 10% to 90% while health stays `onTrack` until someone posts an update. Staleness is an overlay on that stored value.
6. **Milestone percent is not completed/total count.** Replica `milestoneStats` is a different measure. Linear Milestone progress is the Project formula on that Milestone's Issues.
7. **A completed Project with no live Issues showing 100% is a client completion overlay**, not in the public `Project.progress` comment.

## Replica `projectScope` versus Linear

Replica (`src/logic.ts`):

- live = Issues with `status !== "canceled"`
- weight = `estimate ?? 1`
- started = `status === "progress"`
- completed = `status === "done"`
- ratio = `(completed + 0.25 × started) / scope`, or 0 if scope is 0

| Rule | Replica | Linear |
| --- | --- | --- |
| 0.25 × started + 1 × completed | yes | yes |
| Empty live scope → 0 | yes | yes (API Cycle text + client; Project.progress comment silent). Client then overrides to 1 if the Project is completed |
| Skip canceled | yes | yes, plus duplicate and triage |
| Unestimated = 1 | always | estimates off → 1; estimates on → Team `defaultIssueEstimate` (default 1) |
| Started / completed categories | replica five statuses | WorkflowState types `started` / `completed` |
| Cap at 1 / 0.999 / display 99% | no (can only reach 1 if every live Issue is done) | yes |
| Return shape | `{ scope, started, completed, ratio }` | API: one `Float` plus separate `scope`; client also has percent text |
| Milestone | completed **count** / live count, 0–100 | same 0.25 estimate ratio as Project, 0–1 then percent |

Replica health is a field on `Project` plus `updates[]`. That is the right *kind* of object (a posted report), and the UI reads `project.health` separately from `projectScope`. The replica does not implement health-with-age (`outdated` / `noUpdate`).

## Unknowns

- Whether public `Project.progress` already applies the 0.999 cap, the completed-empty → 1 overlay, and triage/duplicate exclusion, or only the hosted client does. Schema comment only states the 0.25 expression.
- Exact JSON shape of Internal `currentProgress` / `archivedProgress` / `progressHistory`.
- Whether a parent Issue and its sub-issues both counting is the intended scope (both inherit the Project) or an over-count when the parent also has an estimate.
- Mixed-team Projects: each Issue uses its own Team's estimate scale and default. How the public `scope` Float treats T-shirt versus numeric teams in one Project is not separately documented.
- Default `ProjectUpdate.health` when create omits `health` but the stored field is non-null.
- Runtime confirmation against a logged-in workspace (this session did not).
- Graph ±40% prediction and hourly snapshot timing, beyond the remaining-points ¼ modifier already documented.

## Invariants (locked from these sources)

1. Progress and health are different fields and different mechanisms. (schema `Project.progress` vs `Project.health`; product updates page)
2. Progress arithmetic is `(completed estimate points + 0.25 × in-progress estimate points) / total`. (`Project.progress` comment; `Cycle.progress` comment; hosted-client multipliers completed=1, started=0.25)
3. In-progress means WorkflowState type `started`. (client buckets; product graph "Started" Issues)
4. Progress and scope are not writable on Project create/update. (absent from those inputs)
5. Health ∈ {`onTrack`, `atRisk`, `offTrack`} or null, taken from the latest Project update. (`Project.health` comment)
6. Posting health is `ProjectUpdate` create, not `projectUpdate`. (`ProjectUpdateCreateInput` vs `ProjectUpdateInput`)
7. `outdated` / `noUpdate` are filter/icon overlays, not health enum values. (`ProjectFilter.healthWithAge`; product staleness copy; client health-with-age helper)
8. Milestone progress uses the same 0.25 estimate formula as Project progress; Milestone `status` is derived (`done` / `next` / `overdue` / `unstarted`). (schema read-only fields; client `getStatus`; product "starts counting" wording)
9. Unestimated Issues are 1 point when the Team does not use estimates, and `defaultIssueEstimate` (default 1) when it does. (schema Team fields; estimates docs; client estimate helper)

## Evidence IDs

| ID | Operation | What it supports |
| --- | --- | --- |
| `ev_4be3f695bdcd2f183efc1619a59beb7f00d7676223ce2057c4b80baca36a7279` | `analyze_javascript_application` on `/tmp/linear-client-assets` (`html.js`, `entry.js`, `Root.js`) | Hosted-client bootstrap: `/auth/desktop` loads `entry` → `Root`, not `app.asar` |
| `ev_85d33d58575e683677dc663b9e4d0667cf697103958cd9dd6cd34f95247c03ac` | analysis-view summary of the above | 3 parsed JS files; `startup-entry.js` left unselected in that pass |
| `ev_66e25d061db627347125a0486476e903951356a2c6be66b93b147cf13ea374b5` | `analyze_javascript_application` `startup-entry.js` | 3 010 217 bytes parsed; semantic graph truncated (`max_semantic_nodes_per_file` 5000). Formula claims rest on the file digest plus the named observations above, not on a complete semantic graph |
| `ev_20222d385bc7a00af582b13ef5593396cd6a8558d5ebf073abba7724d852c4e1` | analysis-view summary of `startup-entry.js` | Parse succeeded; coverage partial/truncated |

Directory digest `6c00a15236cbe20f0e22c73b30eca9740e021b043418cc7b60e2acad05701cc2`. File SHA-256 for `startup-entry.js`: `608da788180d55ef39dae8819bd9cb2d6338f5994aed4d4e5df87b1657700337`.

Static analysis does not prove runtime execution. Multipliers, bucket membership, and health-with-age rules are observations from the shipped bundle's named helpers, not a live progress computation.

## Coverage

- Public schema comments for Project/Cycle/Milestone progress and Project health: complete for this question.
- Product docs listed above: complete fetch 2026-11-02.
- Hosted client: bootstrap + `startup-entry.js` static. Other lazy chunks (`LazyGraphs`, pages) not used for the ratio (graph prediction is out of scope beyond the ¼ modifier).
- REA semantic graph on `startup-entry.js`: truncated. Do not read graph no-match as absence of the helpers; they are in the file bytes.
- Runtime / logged-in session: not observed.
- Replica: `projectScope` and `milestoneStats` only.

## What this ticket is not

Not an adoption decision for `src/`. Not a dump of Linear source. Not a reconstruction of graph prediction, Initiative health, or Cycle success beyond the shared 0.25 expression.

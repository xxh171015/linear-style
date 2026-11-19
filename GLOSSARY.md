# Linear-style product

This local workspace follows the observed Linear interface and interactions. Reference observations and offline-only rules are distinguished in docs/research/linear-parity/README.md. ADR-0005 supersedes the earlier five-state and flat-query restrictions. ADR-0007 allows connected adapters after an explicit grant; unconnected use stays local.

## Language

**Issue**:
A unit of work identified by a human identifier (`{teamKey}-{number}`). It belongs to the ambient Team, may belong to one Project and one parent Issue, and may name a Milestone of that Project. Leaving the Project clears the Milestone. The same Issue is the same object from every list.
_Avoid_: Ticket, task

**Issue status**:
A named state: backlog, todo, progress, review, done, canceled, duplicate, or triage. Categories are separate; progress and review are started, canceled and duplicate are canceled, and triage is its own category. The named state `review` (In Review) is not a Review.
_Avoid_: WorkflowState, state, status category

**Team**:
The home of Issues, with a unique 2–8 character key used in identifiers (`{teamKey}-{number}`). A workspace may contain several Teams; Home, Triage, Issues and Cycles follow the selected Team. My Issues stays workspace-wide.
_Avoid_: Workspace, organization (for this role)

**Label**:
A named, colored tag on Issues. Names still live on each Issue; the workspace also keeps a color catalog per Team.
_Avoid_: Tag, skill

**Pulse**:
A feed of Project updates, Initiative updates and Issue activity. Local composition only; Linear's hosted ranking and notifications are unverified.
_Avoid_: Inbox, Activity (unqualified)

**Estimate**:
Optional size of an Issue in points. Absent means unestimated, not zero.

**Project**:
A named collection of Issues, identified by a slug, living in the ambient Team. It has a Project status, optional lead, optional dates, and ordered milestones. Any Issue in the ambient Team may belong to it.
_Avoid_: Board, epic

**Project status**:
One of backlog, planned, started, paused, completed, or canceled.
_Avoid_: ProjectStatus entity, workflow

**Project update**:
A dated health snapshot plus narrative for a Project. The Project's health is the health of its latest update, or none if it has never been updated.
_Avoid_: Status update, pulse

**Project health**:
One of onTrack, atRisk, or offTrack. It comes from a Project update, not from progress or Project status.
_Avoid_: Progress, status

**Milestone**:
An ordered checkpoint inside a Project, with a name and an optional target date. Its progress uses the same estimate-point rule as the Project.
_Avoid_: Phase, sprint, version

**Custom View**:
A named, locally shareable saved query over Issues or Projects. Its query is distinct from page-scoped display preferences. Legacy grouping/layout fields supply migration defaults. Built-in lists and Project membership remain separate queries.
_Avoid_: View (unqualified), saved search, View Preferences, FilterMatcher

**View filter**:
The Custom View's membership. Issue queries support independent AND/OR condition groups and text, ownership, status, Project, Cycle, label, Team, due date, estimate and priority conditions. Project queries use their own Project statuses, lead, text, labels and priority. An empty filter is unconstrained; priority 0 is a set condition.
_Avoid_: CustomViewFilter (Linear's name for filtering the list of views), IssueFilter

**Built-in list**:
My Issues, Team Issues, or a Project's Issues tab. These are queries, not Custom Views. They use separately persisted display preferences, without creating a Custom View record.
_Avoid_: View, implicit view

**Cycle**:
A dated team iteration, with its own identity and optional Issue membership. Completed/Current/Upcoming/Planned are date-based display phases. The local capacity rule is explicitly a local default.

**Initiative**:
A higher-level grouping of Projects. Local progress uses the unique linked Issues once. Original hosted health and progress aggregation remain unverified.

**Workspace**:
The single-user offline document containing canonical entities, files, drafts, queries and preferences. All screens subscribe to its snapshots.

**Loop**:
A saved trigger, action and scope with a run history. It may call Agent and may run local assign or priority actions. A GitHub write or Coding session is enqueued as a Confirmation; the Loop does not start those itself. A Loop is not an Agent. Prompt text is the action's instruction.
_Avoid_: automation (unqualified), agent (for this role), bot

**Agent**:
A conversational assistant over the Workspace, with a chat history. Distinct from Loop and from Coding session.
_Avoid_: AI (unqualified), Copilot, bot

**Review**:
A record of a pull-request review, which may be linked to Issues. With a GitHub Connection it is a projection of a GitHub pull request; without one it may be a local pasted diff. Distinct from Issue status `review` (In Review).
_Avoid_: PR, pull request (as a second entity), review (unqualified)

**Coding session**:
An external execution that applies a change against a code repository. Distinct from Agent chat and from Review.
_Avoid_: agent run, terminal session

**Template**:
A reusable draft of Issue fields, applied when creating an Issue.
_Avoid_: form, snippet, project template, document template

**Connection**:
A Workspace-level grant to call one external system. Distinct from a Confirmation.
_Avoid_: integration, OAuth, credential, token

**Confirmation**:
An explicit member action that authorizes one mutating adapter call. It is an Inbox kind, distinct from a reminder and from activity, and stays there until confirmed or dismissed. Distinct from connecting a Connection and from Review approve.
_Avoid_: permission, approve, grant (unqualified)

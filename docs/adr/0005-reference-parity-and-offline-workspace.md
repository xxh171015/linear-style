# Reference-led states, queries and an offline workspace

Partly superseded by [ADR-0007](0007-connected-adapters.md): outbound GitHub, model, and coding-session calls are allowed after an explicit Workspace connection. Named states, queries, and the Workspace snapshot boundary in this ADR still stand.

Supersedes ADR-0001 and revises the restrictions in ADR-0003/0004. The explicit user request is now to match the observed Linear interface and interactions instead of preserving the original simplified replica subset.

Named Issue states are Backlog, Todo, In Progress, In Review, Done, Canceled, Duplicate and Triage. State categories are separate: In Progress/In Review are started; Canceled/Duplicate are canceled; Triage is its own category. Duplicate and parent references are distinct and validated against cycles.

The Workspace is the transaction/persistence boundary. All mounted screens subscribe to its immutable snapshots, and issue changes go through shared commands. IndexedDB stores a versioned document including Blob attachments. Saves are serialized; errors preserve memory state, expose retry/export, and do not silently reseed saved records. Old v1 snapshots can be migrated. Imported documents are validated before replacement.

A Custom View is a saved query. It may query Issues (including AND/OR groups) or Projects (with a model-specific filter). Display preferences are stored separately and keyed by page or view ID. Legacy `grouping` and `layout` fields remain only as migration/default compatibility inputs. Built-in lists remain queries, not Custom View records.

The local progress formula remains the existing estimate-weighted implementation while original server calculations remain unverified. It now treats In Review as started and excludes Duplicate and Triage from local live scope. This is a local compatibility rule, not proof of Linear's formula.

Agent, reviews and Loop actions use local service boundaries. Proposals require an explicit save; no external message, AI request, code session, hosted review or Git merge is sent. Loop schedules only advance while the application is open; missed runs are coalesced into one run. External actions record a `limited` result. Priority automation uses an explicit duplicate-report threshold and never raises every Issue indiscriminately.

Read-only reference observation is separate from local browser acceptance tests. The evidence/coverage ledger is `docs/research/linear-parity/README.md`; visual acceptance is tracked independently in `design-qa.md`.

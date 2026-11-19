# Workspace Connection identity and Confirmation

GitHub and model Connections are Workspace-level. An Admin pastes and rotates the secrets on the account server; renderers never receive them. Members may use a connected adapter; they cannot see the secret.

GitHub mutations appear as the PAT owner. A member Confirmation authorizes using that Connection, not the member's GitHub account. The UI must say so.

Enabled Loops may call the model and may assign, raise priority, or summarize without a UI. They must not merge, approve, comment on GitHub, or start a Coding session. Those enqueue a pending Confirmation in Inbox; `limited` remains “not connected”, not “waiting”.

The GitHub PAT is fine-grained: metadata read, contents read, pull requests write, commit statuses read, actions read. There is no Checks permission on user PATs, so CI is Actions runs plus commit statuses. Allowed `owner/repo` values live in Settings; other URLs are refused. Merge uses the repository's GitHub default method.

GitHub is pulled, not pushed: the account server fetches when a Reviews list or connected Review opens, when a PR URL is saved, and about every 60 seconds while that page stays open. No webhooks, and no full-repo scan while no client is looking. Bidirectional comments are the PR conversation thread only, not line or hunk comments. Any Workspace member may confirm or dismiss a pending Confirmation; dismiss finishes the LoopRun as `failed` (cancelled) and does not execute. Confirmation is its own Inbox kind.

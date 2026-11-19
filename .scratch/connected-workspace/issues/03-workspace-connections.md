# 03: Workspace Connections in Settings

**What to build:** An Admin pastes Workspace-level GitHub, model, and coding Connections on the account server. Members can see that a Connection exists, not the secret. Signed-out Settings say this device is offline.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Admin can paste, rotate, and disconnect GitHub (PAT + `owner/repo` allow list), model (OpenAI-compatible base URL, API key, optional model name), and coding (argv + absolute working directory)
- [x] Members may use a connected adapter; they cannot create, rotate, or delete Connections
- [x] HTTP and Settings show redacted status only (`connected`, `repos`, `login`, `baseUrl`, `model`, `argv`, `cwd`); secrets never reach the renderer or a workspace export
- [x] GitHub PAT is treated as fine-grained: metadata read, contents read, pull requests write, commit statuses read, actions read; no Checks permission
- [x] Signed-out Settings hide Connection fields and state that this device is offline
- [x] Unconnected IndexedDB mode still sends no outbound GitHub, model, or coding calls

## Answer

Landed on `feat/connected-workspace` as `6a0e652`. HTTP tests cover admin paste/rotate/disconnect with redacted status and member 403; signed-out Settings hide Connection fields; unconnected Workspace commands do not call `fetch`. PUT coding Connection now 400 unless `cwd` is absolute.

# 03: Workspace Connections in Settings

**What to build:** An Admin pastes Workspace-level GitHub, model, and coding Connections on the account server. Members can see that a Connection exists, not the secret. Signed-out Settings say this device is offline.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [ ] Admin can paste, rotate, and disconnect GitHub (PAT + `owner/repo` allow list), model (OpenAI-compatible base URL, API key, optional model name), and coding (argv + absolute working directory)
- [ ] Members may use a connected adapter; they cannot create, rotate, or delete Connections
- [ ] HTTP and Settings show redacted status only (`connected`, `repos`, `login`, `baseUrl`, `model`, `argv`, `cwd`); secrets never reach the renderer or a workspace export
- [ ] GitHub PAT is treated as fine-grained: metadata read, contents read, pull requests write, commit statuses read, actions read; no Checks permission
- [ ] Signed-out Settings hide Connection fields and state that this device is offline
- [ ] Unconnected IndexedDB mode still sends no outbound GitHub, model, or coding calls

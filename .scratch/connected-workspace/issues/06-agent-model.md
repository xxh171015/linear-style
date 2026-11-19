# 06: Agent model Connection

**What to build:** With a model Connection, Agent infers over the Workspace via OpenAI-compatible HTTP. Without one, chat falls back to the local assistant. Agent does not approve, merge, or comment on GitHub.

**Blocked by:** 03 Workspace Connections in Settings

**Status:** ready-for-agent

- [ ] Signed-in Agent calls `/v1/chat/completions` when a model Connection exists
- [ ] No model Connection returns conflict/not-connected and the UI falls back to the local assistant
- [ ] Signed-out Agent stays on this device and does not send
- [ ] Agent may draft Issues/Projects; it must not approve, merge, or comment on GitHub

# 06: Agent model Connection

**What to build:** With a model Connection, Agent infers over the Workspace via OpenAI-compatible HTTP. Without one, chat falls back to the local assistant. Agent does not approve, merge, or comment on GitHub.

**Blocked by:** 03 Workspace Connections in Settings

**Status:** resolved

- [x] Signed-in Agent calls `/v1/chat/completions` when a model Connection exists
- [x] No model Connection returns conflict/not-connected and the UI falls back to the local assistant
- [x] Signed-out Agent stays on this device and does not send
- [x] Agent may draft Issues/Projects; it must not approve, merge, or comment on GitHub

## Answer

Landed on `feat/connected-workspace` as `1d6819d`. Product code already called the connected model and 409-fell-back; commit adds HTTP proofs for `/v1/chat/completions`, unsigned 401, and that Agent never writes GitHub. Remaining gap: no jsdom of signed-in 409 → local assistant (hosted `fallback: true` covers the contract).

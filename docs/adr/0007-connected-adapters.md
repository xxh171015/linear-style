# Connected adapters after an explicit grant

ADR-0005 forbade any outbound AI request, hosted Review, Coding session, or Git merge. Daily-use GitHub and Agent work need those calls. Default adapters stay local and must report `limited` or `failed`, never a fake success. Outbound calls are allowed only after a user of that Workspace has connected and granted the adapter. Unconnected IndexedDB offline mode does not send. Credentials live on the loopback account server, not in the renderer.

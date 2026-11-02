# Locate Issue, Project, and Custom View logic in Linear.app

Ticket: [Locate Issue, Project, and Custom View logic in Linear.app](https://github.com/xxh171015/linear-style/issues/2)
Map: [Spec Linear Issue, Project, and Custom View product logic](https://github.com/xxh171015/linear-style/issues/1)

This note answers one question: where in Linear.app 1.32.8 (`@linear/desktop`) Issue, Project, and Custom View **product** logic actually lives. It maps the shipped client at low resolution so later tickets can hand seeds to REA `trace_application_feature`. It does not reconstruct filter evaluation, progress math, or workflow rules, and it does not quote Linear source.

## Gist

Issue, Project, and Custom View product logic is **not** in `Contents/Resources/app.asar`. That archive is a thin Electron shell (main, preload, an empty renderer HTML, native gesture addons). The main process loads the hosted app at `https://linear.app` (`entryUrl` `/auth/desktop` in production). GraphQL operation names, product stores/reducers, and domain evaluation are therefore **not** in the asar; the next evidence is a hosted Electron renderer / web bundle, not another pass over this archive.

## Method

- Identity: `Info.plist` `CFBundleShortVersionString`, asar `package.json` `name` / `version`.
- REA `inspect_desktop_application` on `/Applications/Linear.app`, `inspect_plist`, `inspect_electron_fuses`.
- REA `analyze_javascript_application` on `/Applications/Linear.app/Contents/Resources/app.asar` with `integrity_policy=record-and-continue` (required: unpacked native addons disagree with declared asar integrity hashes). Summary plus `inspect_analysis_view` (javascript-facts, javascript-routes, module references).
- REA `trace_application_feature` on the retained application graph for `loadURL`, `createWindow`, `ElectronBridge`, `Issue`, `CustomView`, `https://linear.app`, `/auth/desktop`, `linear.app`.
- Byte inventory of the asar (file list and sizes; URL and IPC **names** only). No logged-in Linear session. Public GraphQL is out of scope.

Static analysis does not prove runtime execution. Where a conclusion depends on `loadURL` call shape plus Constants literals, it is marked **inference**.

## Identity

| Field | Value | Authority |
| --- | --- | --- |
| Bundle path | `/Applications/Linear.app` | filesystem |
| `CFBundleIdentifier` | `com.linear` | `inspect_plist` `ev_bc23cb56112084f5b8d00ed24a476bd30b8d7db8dfa6b6cda7cb0d0bdae1bf24` |
| `CFBundleShortVersionString` / `CFBundleVersion` | `1.32.8` | same |
| `NSPrincipalClass` | `AtomApplication` | same (Electron) |
| asar `package.json` `name` | `@linear/desktop` | javascript-facts `ev_bc717dd54c7816a83a8b77bdf69008854514c25b741c08aecb609a4cb74ab80a` |
| asar `package.json` `version` | `1.32.8` | same |
| asar `package.json` `main` | `./out/main/index.js` | same; resolved electron-main `out/main/index.js` |
| asar `package.json` `homepage` | `https://linear.app` | package.json bytes |
| asar SHA-256 | `5f13f9e9784b1c5a13b761ec50657879408084e8f8ee91fbfb3c6b1aa80b0dd8` | REA artifact digest |
| asar size | 994 419 bytes | filesystem |

`package.json` declares no `renderer` field (`renderer: null`). Optional native packages: `@linear/desktop-force-press`, `@linear/desktop-haptics`, `@linear/desktop-swipe-navigation` (each `1.0.0`, main is the `.node` binary).

## Observations

### The asar file list is the whole shipped JS surface

REA counted 14 relevant files, 5 parsed JavaScript sources, 0 webpack/Rspack module graphs of a product app, 0 static route patterns (`javascript-routes` sources_seen=5, route_patterns=0). Parsed JS:

| Path | Bytes | Role (from path + recovered exports) |
| --- | --- | --- |
| `out/main/index.js` | 852 022 | Electron main. Recovered exports: `createWindow`, `windowRegistry`, `updater`, `getLastActiveWindow`, `refreshMenu` |
| `out/main/server.js` | 3 819 | Local helper HTTP `Server` |
| `out/main/chunks/Constants-DFIMYa3N.js` | 1 652 | Host / entry / feed URL constants |
| `out/preload/index.js` | 16 072 | Preload; `contextBridge` APIs `ElectronBridge`, `__electronSystemLocale__` |
| `out/preload/review-preview.js` | 89 026 | Review-preview preload (GitHub PR preview host) |
| `out/renderer/index.html` | **0** | Empty file |
| `out/renderer/error.html` | 3 907 | Local error page; one unanalyzed inline script starting at line 144 |
| `out/main/chunks/windows-unread-overlay-QIpW-5ua.ico` | 23 166 | Windows overlay icon |
| `package.json` | 519 | Identity |
| three `node_modules/@linear/desktop-*` packages | `.node` + tiny package.json | Unpacked native addons |

There is no product renderer bundle, no `src/` tree, no GraphQL documents, and no Issue/Project/Custom View model modules in the archive.

### Desktop shell vs hosted app (load-bearing)

Constants (`out/main/chunks/Constants-DFIMYa3N.js`) contain these production/dev URL literals (string inventory, not a source dump):

- `https://linear.app`
- `https://local.linear.dev:8080`
- `http://localhost:6969/`
- `https://releases.linear.app/`
- template `` `${m}/auth/desktop` ``

Object keys on that config include `host`, `entryUrl`, and `appFeedUrl`. Production values in the same file: `host` = `https://linear.app`, `entryUrl` = that host plus `/auth/desktop`, `appFeedUrl` = `https://releases.linear.app/`. A development flag switches `host`/`entryUrl` to `https://local.linear.dev:8080` and the feed to `http://localhost:6969/`.

Main-process `loadURL` call shapes (static, `out/main/index.js`; REA recovered only the literal endpoint `about:blank`):

- `webContents.loadURL` with the Constants `host`
- `webContents.loadURL` with `host` plus a path segment
- `webContents.loadURL` with `host` plus a path when that path starts with `/auth`
- `webContents.loadURL` with Constants `entryUrl` (reload and post-login)
- `loadURL("about:blank")` for a back-navigation case

`isAppUrl` is used on `will-navigate` / main-frame checks against the app `host`: in-app URLs stay in the window; others are prevented and opened externally. A classifier labels a URL `app`, `website`, or `external`.

`out/renderer/index.html` is empty, so the shell is not shipping a local product UI for `loadFile`.

`out/main/server.js` is a loopback helper (ports listed as `DESKTOP_PORTS`, env `VITE_CLIENT_URL` / `CLIENT_URL` / `API_SERVER_URL`, routes `/linear/check-url` and `/linear/open-url`). That is protocol/URL plumbing, not Issue/Project/Custom View evaluation.

`app-update.yml` is a custom electron-updater feed (`updaterCacheDirName: '@lineardesktop-updater'`), consistent with `appFeedUrl` pointing at `releases.linear.app`.

### Renderer vs main vs preload

| Process | What the asar contains | Product Issue / Project / Custom View logic |
| --- | --- | --- |
| **Main** | Window create/load, updater, Sentry, menu, `isAppUrl`, native addon wiring, loopback server | Not present. Chrome around a hosted URL. |
| **Preload** | `contextBridge.exposeInMainWorld("ElectronBridge", …)` and `__electronSystemLocale__`; IPC fan-out | Not present. Desktop chrome bridges (`newIssue`, `newProject`, `desktopRedirect`, …). |
| **Renderer (shipped)** | Empty `index.html`; error HTML only | Not present. Product renderer is the hosted page the main process loads. |

REA Electron summary on the asar (`ev_c95b9a7c07cc5f2744b964e57cbfbe625bbaf99c9aaf129c5b07b96c1732ee26`): `browser_windows` 0, `explicit_web_preferences` 0, `preload_entrypoints` 0 as recovered Electron API nodes (minified usage; `createWindow` still exists as a module export), `context_bridge_apis` 2, `ipc.operations` 102, `literal_channels` 0, `dynamic_channel_operations` 102, `native_addon_bindings` 0 resolved, `request` relations 0.

### IPC and preload names (shell chrome, not domain)

REA treats every IPC channel as **dynamic** (property access like `n.newIssue`, not a unique exact literal), so it does not pair main↔renderer by channel string. Observed labels on those expressions (preload/main), useful as later seeds:

`n.newIssue`, `n.newProject`, `n.desktopCreateAction`, `n.desktopRedirect`, `n.openAuthPopup`, `n.clientBootstrapComplete`, `n.clientLoginStatusChange`, `n.clientPushMessage`, `n.checkFlagOrConfig`, `n.navigationStateChange`, plus window/tab/update/haptic/force-press/swipe/review-preview/flare/command-menu channels.

Preload string inventory also includes `issue`, `project`, `projects`, `views`, `my-issues`, `auth`, `oauth`, `mobile-auth`, `newIssue`, `newProject`, `ElectronBridge`. These are desktop deep-link / menu tokens, not GraphQL types.

`trace_application_feature` seed `Issue` matched `n.newIssue` and several `*.issues` arrays from a schema validator (Zod), not an Issue entity module.

Seed `CustomView` / `customView` / `custom-view`: **zero** byte matches in the asar JS/HTML, and REA trace `ev_a22c73f31222fb891f70d3eda42bfaddf935b423f4d741f247253f04fec3d275` was `no-match`.

### GraphQL operation names

None. No `operationName` literals, no `query`/`mutation`/`subscription` operation identifiers, no Apollo/Relay/urql client strings in the five JS sources.

### Stores / reducers

No Redux, MobX, Zustand, Recoil, Apollo, or Relay identifiers in the asar JS. Four `createStore` hits in `out/main/index.js` sit next to `flushAtStartup` (telemetry SDK), not a product store.

### Native addons and fuses

Unpacked `.node` files (force-press, haptics, swipe-navigation) are gesture/input helpers. REA recorded integrity contradictions on all three (declared asar hashes ≠ on-disk bytes; typical after signing). Fuse `EnableEmbeddedAsarIntegrityValidation` is **disabled**, `OnlyLoadAppFromAsar` is **disabled** (`ev_fa701de69016df72e8ec0bf16b4e61f9b28ec9bce798d4c847f93d7027b3c407`). Native internals are out of scope.

`Info.plist` `ElectronAsarIntegrity` hash for `Resources/app.asar` is `818c84b11341509dd196b63a97d9d1d23eff9a7d415baa461fbc8c19cfe36193`, which does **not** equal the file SHA-256 above. With the integrity fuse off, that mismatch is recorded, not interpreted as a different app.

### Other hosted surfaces (not the three cores)

Main JS also names `https://linear.review` (GitHub PR preview origin check) and help URLs `https://linear.app/changelog`, `https://linear.app/docs`. Review preview has its own preload. Those are not Issue/Project/Custom View product logic.

## Inferences

1. **The product client is the hosted Linear web app**, loaded into a `BrowserWindow` from `host` / `entryUrl`. That is why the asar is ~1 MB, why renderer HTML is empty, why there are no product routes or GraphQL documents, and why `loadURL` is parameterized by those Constants fields rather than a local file.
2. **Issue / Project / Custom View evaluation, filters, progress, and workflow live in that hosted renderer (and/or the API it calls), not in `@linear/desktop`.** Asar `Issue`/`Project` hits are menu IPC, feature-flag copy, and validator `issues` arrays.
3. **Later REA traces for the three cores must target the hosted session or a captured web bundle**, using the seeds below. Tracing the asar again will not surface domain modules.
4. Production `host` is `https://linear.app` in the shipped Constants; which origin a given install actually loads is still a runtime fact (dev flag, env, login redirect).

## Unknowns

- Runtime confirmation: this session did not launch Linear or inspect a live Electron/CDP target (`list_electron_targets` / `inspect_web_page` / `analyze_web_bundle` unused on purpose; no logged-in session).
- Hosted JS chunk layout, route table, GraphQL operation names, and stores/reducers for Issue, Project, and Custom View.
- Whether any product rule is evaluated on the API server rather than in the hosted client.
- Actual runtime IPC channel strings (all 102 REA IPC ops are dynamic expressions).
- `out/renderer/error.html` inline script (line 144–159) was not analyzed by REA (application-graph unknown).
- Native addon exports (handoffs `requires-provider-analysis`).
- Semantic graph of main JS is **partial/truncated** (`max_semantic_nodes_per_file` 20000; 27776 semantic unknowns, mostly dynamic-call / ambiguous-target). Raising that ceiling cannot invent missing product modules; the files are the complete asar JS set.
- REA string-seed traces for `https://linear.app`, `/auth/desktop`, and `linear.app` returned **no-match** on the application graph even though those bytes exist in Constants/package.json. Use module path `out/main/chunks/Constants-DFIMYa3N.js` plus the URL strings as seeds; do not treat graph no-match as absence.
- Public GraphQL schema / operations: owned by other tickets.

## Evidence IDs

| ID | Operation | What it supports |
| --- | --- | --- |
| `ev_7c82192cdf5917d8dfe1b9fc9d7841f635a279ab28483536097cc805f0fa222b` | `inspect_desktop_application` | Bundle is an Electron app because of `Contents/Resources/app.asar` |
| `ev_ce535011eb6bde1a834b7c4f6509588c6b04156270858bb666b0b8fa2eb23fb6` | analysis-view summary of the above | 621 entries scanned; next probe = analyze the asar |
| `ev_bc23cb56112084f5b8d00ed24a476bd30b8d7db8dfa6b6cda7cb0d0bdae1bf24` | `inspect_plist` | Version 1.32.8, `com.linear` |
| `ev_fa701de69016df72e8ec0bf16b4e61f9b28ec9bce798d4c847f93d7027b3c407` | `inspect_electron_fuses` | ASAR integrity fuse off; not restricted to app.asar |
| `ev_bca71baa2e500e13826817fb3887e2132a41918e99fe327ff599de6cede4a4e1` | `analyze_javascript_application` (parent) | Full asar JS graph; 5 sources; partial semantic coverage |
| `ev_c95b9a7c07cc5f2744b964e57cbfbe625bbaf99c9aaf129c5b07b96c1732ee26` | analysis-view summary | File counts, Electron IPC/bridge stats, limitations |
| `ev_bc717dd54c7816a83a8b77bdf69008854514c25b741c08aecb609a4cb74ab80a` | javascript-facts `package.json` | `@linear/desktop` 1.32.8, main `out/main/index.js` |
| `ev_ace9848fec99efcd4d9e65aed16c9bb12cc00f1d848a1e1b4424850adaf4c7fd` | javascript-routes sources | The five JS paths; no product renderer |
| `ev_36ec95d8a1026a9b09d78ba02c2edd6967b62c0cac3efd4f252b24b3be224373` | javascript-routes summary | 0 route patterns |
| `ev_e75c0248136fbef5b3136fb0b51132965653255011579f1fd9ed26c79f4362a2` | javascript module references | Source modules + `createWindow` / `windowRegistry` exports |
| `ev_56097f072636f74a1cd35c05130076b066479b62eb2913cfc46c958ab91dcdd9` | `trace_application_feature` `loadURL` | 3 seed matches (incl. `about:blank` endpoint); 538 nodes |
| `ev_f53e6c681854f6861969959afd02bb03791c224b8d9e5c338200b561fa72aa13` | trace `createWindow` | Export on `out/main/index.js` |
| `ev_5dac2bafd24aa036f23675f93003172c84e97a956edba1832600d03fa0699b76` | `trace_application_feature` `ElectronBridge` | contextBridge API on preload |
| `ev_866e4a5da10a77127f7882605446ed51b9a60f298056bb75d978703955975e48` | `trace_application_feature` `Issue` | matched `n.newIssue` plus validator `issues` arrays, not a domain module |
| `ev_a22c73f31222fb891f70d3eda42bfaddf935b423f4d741f247253f04fec3d275` | `trace_application_feature` `CustomView` | no-match |
| `ev_2e55813d50b00f7982811c035db7d5fe196aab6382aeb6d4d5ae491c4d9fb0b9` | `trace_application_feature` `/auth/desktop` | no-match on graph (bytes still in Constants) |
| `ev_c71ce25295d8b818a54782324c01772eb05f97032f8cdc8be8cb4d15ae728f1b` | `trace_application_feature` `https://linear.app` | no-match on graph (bytes still in Constants / package.json) |
| `ev_e8d8a1eb282ce6ed182b4a37daa05f2713036d663dbe8919117d73765ecc40c7` | `trace_application_feature` `linear.app` | no-match on graph |

Application-graph unknown (error.html inline script) node: `jag_node_92b2978e97bf7e1d8b9afad232f744493585a9eaebe16a44550fba432d440888`. Context-bridge node for `ElectronBridge`: `jag_node_eab86f980756201c90d636abdc857e10bf3f7249b0e8154d986e53ef03f79101`.

## Seeds for later `trace_application_feature`

Hand these to a **hosted-app** analysis (`analyze_web_bundle` / live Electron renderer), not to a repeat asar-only pass.

### Asar (shell only — already traced)

| Seed | Kind | Where | Result this ticket |
| --- | --- | --- | --- |
| `out/main/index.js` | module path | main | `createWindow`, `loadURL` of `host`/`entryUrl` |
| `out/main/chunks/Constants-DFIMYa3N.js` | module path | main | `host`, `entryUrl`, `appFeedUrl` |
| `out/preload/index.js` | module path | preload | `ElectronBridge` |
| `createWindow` | export name | main | matched |
| `loadURL` | string | main | matched; product URL is computed, not a static asar file |
| `ElectronBridge` | string / API | preload | matched |
| `CustomView` | model name | asar | absent |
| `Issue` | model name | asar | chrome/validator only (`n.newIssue`); evidence `ev_866e4a5da10a77127f7882605446ed51b9a60f298056bb75d978703955975e48` |

### Hosted renderer (next evidence)

| Seed | Why |
| --- | --- |
| `https://linear.app` | production `host` |
| `/auth/desktop` | production `entryUrl` path |
| `https://local.linear.dev:8080` | shipped dev host |
| `Issue`, `Project`, `CustomView` | domain model names (absent from asar) |
| `newIssue`, `newProject` | desktop IPC the hosted page is expected to consume |
| `views`, `my-issues`, `projects` | preload tokens |
| `ElectronBridge` | hosted page talks to this preload API |

Next probe (not done here): with Linear running **without** driving a logged-in session if a logged-out shell is enough, `list_electron_targets` → `inspect_web_page` / `analyze_web_bundle` on the `https://linear.app` renderer. If the product bundle only appears after login, that login is a later-ticket decision; this ticket stops at naming that unknown.

## Coverage

- Asar inventory: complete file list.
- JS parse: complete for the five JS files; HTML inline script in `error.html` unavailable.
- Semantic graph: partial/truncated on large main bundle.
- Routes: complete candidate enumeration over provided sources; **application** route set unknown because product routes are not in those sources.
- Runtime: not observed.
- Integrity: 3 unpacked native contradictions recorded as untrusted bytes.

## What this ticket is not

Not a reconstruction of filters, progress, or workflow. Not a GraphQL map. Not a dump of Linear source or minified JavaScript.

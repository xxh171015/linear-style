import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import * as I from "./icons";
import { ISSUE_STATUSES, PRIORITY_LABEL, STATUS_LABEL } from "./kernel";
import type {
  CustomViewFilter,
  DisplayPreferences,
  IssueStatus,
  NavId,
  Priority,
} from "./types";
import {
  Button,
  Dialog,
  Empty,
  Field,
  IconButton,
  Status,
  WorkspaceContext,
  useData,
  useAllData,
  useWorkspace,
} from "./ui";
import {
  DisplayMenu,
  FilterMenu,
  IssueComposer,
  IssueDetail,
  IssueList,
} from "./issue-ui";
import {
  AgentPage,
  CyclesPage,
  HomePage,
  InboxPage,
  InitiativesPage,
  LoopsPage,
  ProjectPages,
  ReviewsPage,
  SettingsPage,
  ViewsPage,
  PageHeader,
} from "./feature-pages";
import {
  DEFAULT_DISPLAY,
  Workspace,
  displayIssues,
  matchesFilter,
  type WorkspaceData,
} from "./workspace";
import type { DesktopCommand } from "./desktop";
import { navigateTab, openTab, closeTab, selectTab, reopenTab, activeRoute, moveTabHistory, canMoveTabHistory, restoreTabs } from "./tab-state";
import { navigate, readRoute, routeHash, type Route } from "./router";
import { unreadInboxCount, useNotificationTime, inInboxFolder } from "./notifications";
import { DocumentsPage } from "./documents-ui";
import { ArchivePage, DeleteIssueDialog } from "./archive-ui";
const NAV_LABEL: Record<NavId, string> = {
  inbox: "Inbox",
  "my-issues": "My issues",
  reviews: "Reviews",
  agent: "Agent",
  projects: "Projects",
  views: "Views",
  loops: "Loops",
  "team-home": "Home",
  "team-issues": "Issues",
  triage: "Triage",
  cycles: "Cycles",
  initiatives: "Initiatives",
  settings: "Settings",
  archive: "Archive",
  documents: "Documents",
};
const NAV_ICON: Record<NavId, () => ReactNode> = {
  inbox: () => <I.InboxIcon />,
  "my-issues": () => <I.IssuesIcon />,
  reviews: () => <I.ReviewsIcon />,
  agent: () => <I.AgentIcon />,
  projects: () => <I.CubeIcon />,
  views: () => <I.ViewsIcon />,
  loops: () => <I.LoopsIcon />,
  "team-home": () => <I.HomeIcon />,
  "team-issues": () => <I.IssuesIcon />,
  triage: () => <I.InboxIcon />,
  cycles: () => <I.CalendarIcon />,
  initiatives: () => <I.StarIcon />,
  settings: () => <I.SettingsIcon />,
  archive: () => <I.InboxIcon />,
  documents: () => <I.DocsIcon />,
};
export default function App({ workspace, initialSession }: { workspace: Workspace; initialSession?: unknown }) {
  return (
    <WorkspaceContext.Provider value={workspace}>
      <Shell initialSession={initialSession} />
    </WorkspaceContext.Provider>
  );
}
function Shell({initialSession}:{initialSession?:unknown}) {
  const workspace = useWorkspace(),
    data = useData();
  const all = useAllData();
  const [deleteIssueId, setDeleteIssueId] = useState<string | null>(null);
  const notificationTime = useNotificationTime(data.inbox);
  const [session] = useState(() => {
    let saved=initialSession;
    try { saved ??= sessionStorage.getItem("linear-replica:tabs"); } catch { /* Session storage may be unavailable. */ }
    const recovered=restoreTabs(saved,readRoute());
    return location.hash ? navigateTab(recovered,readRoute()) : recovered;
  });
  const [route, setRoute] = useState<Route>(() => activeRoute(session));
  const [previous, setPrevious] = useState<Route>({ nav: "my-issues" });
  const [peek, setPeek] = useState<string | null>(null),
    [selected, setSelected] = useState<string | undefined>();
  const [composer, setComposer] = useState<{
      projectId?: string;
      cycleId?: string;
      parentId?: string;
      initialStatus?: IssueStatus;
      relation?: import("./types").IssueCreationRelation;
    } | null>(null),
    [command, setCommand] = useState<"command" | "search" | null>(null),
    [query, setQuery] = useState(""),
    [commandIndex, setCommandIndex] = useState(0),
    [quick, setQuick] = useState<
      "status" | "priority" | "assignee" | "labels" | null
    >(null);
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 620),
    [workspaceMenu, setWorkspaceMenu] = useState(false),
    [help, setHelp] = useState(false),
    [recent, setRecent] = useState(false),
    [recentRoutes, setRecentRoutes] = useState<Route[]>([]),
    [tabs, setTabs] = useState(() => session),
    [popover, setPopover] = useState<"filter" | "display" | "workspace-more" | null>(null),
    [filter, setFilter] = useState<CustomViewFilter>({}),
    [toast, setToast] = useState(""),
    [syncReview, setSyncReview] = useState(false);
  const saveState = useSyncExternalStore(
    workspace.subscribe,
    () => workspace.saveState,
  );
  const routeKey =
    route.nav === "my-issues"
      ? `my-issues/${route.id ?? "assigned"}`
      : route.nav;
  const prefs = data.preferences[routeKey] ?? DEFAULT_DISPLAY;
  const setPrefs = (value: DisplayPreferences) =>
    workspace.mutate((d) => {
      d.preferences[routeKey] = value;
    });
  const showToast = (text: string) => setToast(text);
  const openIssue = (id: string, asPeek = false) => {
    setSelected(id);
    if (asPeek) {
      setPeek(id);
      return;
    }
    setPrevious(route);
    navigate({ nav: route.nav, issueId: id });
  };
  const openComposer = (options: NonNullable<typeof composer> = {}) => {
    setComposer(options);
    setCommand(null);
  };
  const tabsRef = useRef(tabs);
  tabsRef.current = navigateTab(tabs,route);
  const moveHistory = (delta:-1|1) => {
    const next=moveTabHistory(navigateTab(tabs,route),delta);
    setTabs(next);
    const value=activeRoute(next);
    history.replaceState(null,"",routeHash(value));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  useEffect(() => {
    history.replaceState(null,"",routeHash(activeRoute(session)));
  }, []);
  useEffect(() => {
    try {sessionStorage.setItem("linear-replica:tabs",JSON.stringify(tabs));} catch { /* Native storage also retains desktop sessions. */ }
    void window.replicaDesktop?.saveSession?.(tabs).catch(() => showToast("Window layout could not be saved. Your workspace data is retained."));
  },[tabs]);
  const newTab = () => {
    const next = openTab(navigateTab(tabs,route), {nav:"my-issues"});
    setTabs(next); navigate(activeRoute(next));
  };
  const closeWorkspaceTab = (id = tabs.activeId) => {
    if (window.replicaDesktop && tabs.items.length === 1) { void window.replicaDesktop.windowAction("close"); return; }
    const next = closeTab(navigateTab(tabs,route),id); setTabs(next); navigate(activeRoute(next));
  };
  const reopenWorkspaceTab = () => { const next = reopenTab(tabs); setTabs(next); navigate(activeRoute(next)); };
  useEffect(() => {
    const bridge = window.replicaDesktop;
    if (!bridge) return;
    const remove = bridge.onCloseRequested(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
      await bridge.saveSession?.(tabsRef.current);
      await workspace.flushed();
      if (workspace.saveState === "error") throw Error(workspace.saveError);
    });
    void bridge.ready();
    return remove;
  }, [workspace]);
  useEffect(() => {
    if (!window.replicaDesktop) return;
    void window.replicaDesktop.setBadge(unreadInboxCount(data.inbox,notificationTime));
  }, [data.inbox,notificationTime]);
  const notified = useRef(new Set(data.inbox.filter(item=>inInboxFolder(item,"inbox",notificationTime)).map(item=>item.id)));
  useEffect(()=>{
    const eligible=data.inbox.filter(item=>inInboxFolder(item,"inbox",notificationTime));
    for(const item of eligible) {
      if(!notified.current.has(item.id) && !item.read && data.settings.desktopNotifications && window.replicaDesktop?.notify) {
        const issue=data.issues.find(issue=>issue.id===item.issueId);
        void window.replicaDesktop.notify({id:item.id,title:(issue?`${issue.id} ${issue.title}`:"Linear Replica").slice(0,500),body:item.text.slice(0,10000),route:`#/issue/${encodeURIComponent(item.issueId)}`}).catch(()=>showToast("The desktop notification could not be shown."));
      }
      notified.current.add(item.id);
    }
  },[data.inbox,data.settings.desktopNotifications,notificationTime]);
  useEffect(() => window.replicaDesktop?.onCommand((command: DesktopCommand) => {
    if (command.type === "new-tab") newTab();
    else if (command.type === "close-tab") closeWorkspaceTab();
    else if (command.type === "reopen-tab") reopenWorkspaceTab();
    else if (command.type === "new-issue") openComposer();
    else if (command.type === "new-project") navigate({nav:"projects",id:"new"});
    else if (command.type === "new-initiative") navigate({nav:"initiatives",id:"new"});
    else if (command.type === "new-document") navigate({nav:"documents",id:"new"});
    else if (command.type === "new-chat") navigate({nav:"agent"});
    else if (command.type === "search" || command.type === "command") { setQuery(""); setCommand(command.type); }
    else if (command.type === "settings") navigate({nav:"settings"});
    else if (command.type === "back") moveHistory(-1);
    else if (command.type === "forward") moveHistory(1);
    else if (command.type === "navigate") { const next = readRoute(command.route); navigate(next); }
    else if (command.type === "reload") {
      (document.activeElement as HTMLElement | null)?.blur();
      void workspace.flushed().then(() => {
        if (workspace.saveState === "error") showToast("Your latest changes could not be saved. Retry before reloading.");
        else window.location.reload();
      });
    }
  }), [tabs,route,workspace]);
  useEffect(() => {
    const changed = () => {
      const next = readRoute();
      setRoute(next);
      setTabs(state => navigateTab(state, next));
      if (window.matchMedia("(max-width:620px)").matches) setSidebar(false);
      setPeek(null);
      setSelected(undefined);
      setPopover(null);
      setFilter({});
      setWorkspaceMenu(false);
    };
    window.addEventListener("popstate", changed);
    window.addEventListener("hashchange", changed);
    return () => {
      window.removeEventListener("popstate", changed);
      window.removeEventListener("hashchange", changed);
    };
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(max-width:620px)");
    const resize = () => setSidebar(!query.matches);
    query.addEventListener("change", resize);
    return () => query.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    setRecentRoutes((routes) =>
      [
        route,
        ...routes.filter((r) => JSON.stringify(r) !== JSON.stringify(route)),
      ].slice(0, 12),
    );
  }, [route]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!popover) return;
    const outside = (event: MouseEvent) => {
      if (!(event.target as Element).closest(".r-menu-anchor"))
        setPopover(null);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [popover]);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined, release: (() => void) | undefined;
    const controller = new AbortController();
    if (navigator.locks) void navigator.locks.request("linear-replica:automation", {signal:controller.signal}, () => new Promise<void>(resolve => {
      release=resolve; timer=setInterval(()=>{if(workspace.saveState==="saved")workspace.tick();},60000);
    })).catch(()=>{});
    else timer=setInterval(()=>{if(document.hasFocus()&&workspace.saveState==="saved")workspace.tick();},60000);
    return () => { if(timer)clearInterval(timer); release?.(); controller.abort(); };
  }, [workspace]);
  let listed = data.issues;
  if (route.nav === "my-issues") {
    const tab = route.id ?? "assigned";
    if (tab === "assigned")
      listed = listed.filter((i) => i.assignee === data.settings.user);
    if (tab === "created")
      listed = listed.filter((i) => i.creator === data.settings.user);
    if (tab === "subscribed") listed = listed.filter((i) => i.subscribed);
  }
  if (route.nav === "triage")
    listed = listed.filter(
      (i) =>
        i.status === "triage" &&
        (!i.snoozedUntil || Date.parse(i.snoozedUntil) <= Date.now()),
    );
  const visible = useMemo(
    () =>
      displayIssues(
        listed.filter((i) => matchesFilter(i, filter, data.settings.user)),
        prefs,
      ),
    [data, route, filter, prefs],
  );
  const current = data.issues.find(
    (i) => i.id === (route.issueId ?? peek ?? selected),
  );
  const title = route.nav==="documents" && route.id && all.documents.some(doc=>doc.id===route.id)
    ? all.documents.find(doc=>doc.id===route.id)!.title
    : route.issueId
    ? `${route.issueId} ${all.issues.find((i) => i.id === route.issueId)?.title ?? ""}`
    : NAV_LABEL[route.nav];
  useEffect(() => { document.title = `${title} — Linear Replica`; }, [title]);
  const commands = useMemo(() => {
    const result: {
      label: string;
      group: string;
      hint?: string;
      run: () => void;
    }[] = [];
    if (command !== "search") {
      if (window.replicaDesktop) result.push({label:"New window",group:"Actions",hint:"⌘ ⇧ N",run:()=>void window.replicaDesktop?.windowAction("new-window")});
      result.push(
        {
          label: "Create new issue…",
          group: "Actions",
          hint: "C",
          run: () => openComposer(),
        },
        ...Object.entries(NAV_LABEL).map(([nav, label]) => ({
          label: `Go to ${label}`,
          group: "Navigation",
          run: () => navigate({ nav: nav as NavId }),
        })),
        {
          label: "Keyboard shortcuts",
          group: "Help",
          hint: "⌘/",
          run: () => setHelp(true),
        },
      );
      if (current)
        result.unshift(
          {label: `Delete issue ${current.id}…`, group: "Issue", hint: "⌘ ⌫", run: () => setDeleteIssueId(current.id)},
          {
            label: `Change status of ${current.id}…`,
            group: "Issue",
            hint: "S",
            run: () => setQuick("status"),
          },
          {
            label: "Assign to me",
            group: "Issue",
            run: () =>
              workspace.updateIssue(
                current.id,
                { assignee: data.settings.user },
                "assigned to you",
              ),
          },
        );
    }
    result.push(
      ...data.issues.map((i) => ({
        label: `${i.id}  ${i.title}`,
        group: "Issues",
        hint: STATUS_LABEL[i.status],
        run: () => openIssue(i.id),
      })),
      ...data.projects.map((p) => ({
        label: p.name,
        group: "Projects",
        run: () => navigate({ nav: "projects", id: p.id }),
      })),
      ...data.documents.filter(doc=>!doc.deletedAt).map(doc=>({label:doc.title,group:"Documents",run:()=>navigate({nav:"documents",id:doc.id})})),
      ...data.views.map((v) => ({
        label: v.name,
        group: "Views",
        run: () => navigate({ nav: "views", id: v.id }),
      })),
      ...data.initiatives.map((i) => ({
        label: i.name,
        group: "Initiatives",
        run: () => navigate({ nav: "initiatives", id: i.id }),
      })),
    );
    const q = query.trim().toLowerCase();
    return result.filter(
      (c) =>
        !q || `${c.label} ${c.group} ${c.hint ?? ""}`.toLowerCase().includes(q),
    );
  }, [command, query, data, current, route]);
  useEffect(() => setCommandIndex(0), [query, command]);
  useEffect(() => {
    let prefix = "";
    let prefixTimer: ReturnType<typeof setTimeout>;
    function onKey(event: KeyboardEvent) {
      const element = event.target as HTMLElement;
      const typing =
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement ||
        element.isContentEditable;
      const lower = event.key.toLowerCase();
      const meta = event.metaKey || event.ctrlKey;
      if (meta && lower === "k") {
        event.preventDefault();
        setCommand(command ? null : "command");
        setQuery("");
        return;
      }
      if (meta && event.key === "/") {
        event.preventDefault();
        setHelp(!help);
        return;
      }
      if (event.key === "Escape") {
        setCommand(null);
        setQuick(null);
        setPopover(null);
        setWorkspaceMenu(false);
        setRecent(false);
        setHelp(false);
        if (peek) setPeek(null);
        else if (route.issueId) navigate(previous);
        return;
      }
      if (command) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setCommandIndex((i) =>
            Math.max(
              0,
              Math.min(
                commands.length - 1,
                i + (event.key === "ArrowDown" ? 1 : -1),
              ),
            ),
          );
        }
        if (event.key === "Enter" && commands[commandIndex]) {
          event.preventDefault();
          commands[commandIndex].run();
          setCommand(null);
        }
        if (event.key === "Tab") {
          event.preventDefault();
          navigate({ nav: "agent" });
          setCommand(null);
        }
        return;
      }
      if (typing || composer || help || quick) return;
      if (prefix === "g") {
        prefix = "";
        const nav = (
          {
            i: "inbox",
            m: "my-issues",
            r: "reviews",
            j: "agent",
            p: "projects",
            v: "views",
            u: "views",
            c: "cycles",
            t: "triage",
            n: "initiatives",
            l: "loops",
            x: "archive",
          } as Record<string, NavId>
        )[lower];
        if (nav) {
          event.preventDefault();
          navigate({ nav });
        }
        return;
      }
      if (lower === "g") {
        prefix = "g";
        clearTimeout(prefixTimer);
        prefixTimer = setTimeout(() => {
          prefix = "";
        }, 1000);
        return;
      }
      if (lower === "c") {
        event.preventDefault();
        openComposer();
      } else if (event.key === "/") {
        event.preventDefault();
        setQuery("");
        setCommand("search");
      } else if (event.key === "?") {
        setHelp(true);
      } else if (event.key === "[") {
        setSidebar(!sidebar);
      } else if (["j", "k"].includes(lower)) {
        event.preventDefault();
        const index = visible.findIndex((i) => i.id === selected);
        setSelected(
          visible[
            Math.max(
              0,
              Math.min(visible.length - 1, index + (lower === "j" ? 1 : -1)),
            )
          ]?.id,
        );
      } else if (event.key === "Enter" && selected) {
        event.preventDefault();
        openIssue(selected);
      } else if (event.key === " " && selected) {
        event.preventDefault();
        openIssue(selected, true);
      } else if (current && ["s", "p", "a", "l"].includes(lower)) {
        event.preventDefault();
        setQuick(
          ({ s: "status", p: "priority", a: "assignee", l: "labels" } as const)[
            lower as "s" | "p" | "a" | "l"
          ],
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(prefixTimer);
    };
  }, [
    route,
    command,
    commandIndex,
    commands,
    visible,
    selected,
    peek,
    current,
    composer,
    sidebar,
    help,
    previous,
    quick,
  ]);
  const navItem = (nav: NavId, label = NAV_LABEL[nav], indent = false) => {
    const Icon = NAV_ICON[nav];
    const count =
      nav === "triage"
        ? data.issues.filter(
            (i) =>
              i.status === "triage" &&
              (!i.snoozedUntil || Date.parse(i.snoozedUntil) <= Date.now()),
          ).length
        : nav === "reviews"
          ? data.reviews.filter(
              (r) => !["merged", "closed"].includes(r.status ?? "review"),
            ).length
          : nav === "inbox"
            ? unreadInboxCount(data.inbox, notificationTime)
            : 0;
    return (
      <a
        href={`#/${nav}`}
        className={`r-nav-item ${route.nav === nav && !route.issueId ? "active" : ""} ${indent ? "indent" : ""}`}
        key={label}
      >
        <Icon />
        <span>{label}</span>
        {count > 0 && <small>{count}</small>}
      </a>
    );
  };
  const props = { route, onIssue: openIssue, onCreate: openComposer };
  const isList = ["my-issues", "team-issues", "triage"].includes(route.nav);
  return (
    <div className={`replica ${sidebar ? "" : "r-sidebar-collapsed"} ${window.replicaDesktop ? `r-desktop r-desktop-${window.replicaDesktop.platform}` : ""}`}>
      <a className="r-skip" href="#main-content">
        Skip to content
      </a>
      <div className="r-titlebar" onDoubleClick={event => { if (window.replicaDesktop && !(event.target as HTMLElement).closest("button,a,input")) void window.replicaDesktop.windowAction("maximize"); }}>
        <div className="r-traffic" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <IconButton label="Toggle sidebar" onClick={() => setSidebar(!sidebar)}>
          <I.PanelIcon />
        </IconButton>
        <IconButton label="Recently viewed" onClick={() => setRecent(true)}>
          <I.HistoryIcon />
        </IconButton>
        <IconButton label="Go back" disabled={!canMoveTabHistory(tabs,-1)} onClick={() => moveHistory(-1)}>
          <I.BackIcon />
        </IconButton>
        <IconButton label="Go forward" disabled={!canMoveTabHistory(tabs,1)} onClick={() => moveHistory(1)}>
          <I.ForwardIcon />
        </IconButton>
        {tabs.items.map(tab => {
          const tabRoute = tab.id === tabs.activeId ? route : tab.route;
          const label = tabRoute.issueId ? `${tabRoute.issueId} ${all.issues.find(issue=>issue.id===tabRoute.issueId)?.title ?? ""}` : tabRoute.id && tabRoute.nav === "projects" ? all.projects.find(project=>project.id===tabRoute.id)?.name ?? "Projects" : tabRoute.nav==="documents" && tabRoute.id ? all.documents.find(doc=>doc.id===tabRoute.id)?.title ?? "Documents" : NAV_LABEL[tabRoute.nav];
          return <div className={`r-workspace-tab ${tab.id === tabs.activeId ? "active" : ""}`} key={tab.id}>
            <button className="r-title-tab" aria-current={tab.id === tabs.activeId ? "page" : undefined} onClick={() => { const next=selectTab(navigateTab(tabs,route),tab.id);setTabs(next);navigate(activeRoute(next)); }}><I.IssuesIcon /><span>{label}</span></button>
            <IconButton label={`Close tab ${label}`} onClick={() => closeWorkspaceTab(tab.id)}><I.CloseIcon /></IconButton>
          </div>;
        })}
        <IconButton label="New tab" onClick={newTab}><I.PlusIcon /></IconButton>
        {window.replicaDesktop && window.replicaDesktop.platform !== "darwin" && <div className="r-native-controls">
          <button aria-label="Minimize window" onClick={() => void window.replicaDesktop?.windowAction("minimize")}>−</button>
          <button aria-label="Maximize window" onClick={() => void window.replicaDesktop?.windowAction("maximize")}>□</button>
          <button aria-label="Close window" onClick={() => void window.replicaDesktop?.windowAction("close")}>×</button>
        </div>}
        <span className="r-push" />
        {saveState === "error" ? (
          <button className="r-save-error" onClick={() => workspace.saveConflict ? setSyncReview(true) : workspace.retrySave()}>
            {workspace.saveConflict ? "Conflicting changes · review" : "Not saved · retry"}
          </button>
        ) : (
          <span className="r-save-status">
            {saveState === "saving" ? "Saving…" : ""}
          </span>
        )}
      </div>
      <div className="r-app-body">
        <aside className="r-sidebar">
          <div className="r-workspace">
            <button onClick={() => setWorkspaceMenu(!workspaceMenu)}>
              <span className="r-workspace-avatar">
                {(data.settings.workspace || "xx").slice(0, 2).toUpperCase()}
              </span>
              <strong>{data.settings.workspace || "Workspace"}</strong>
              <I.ChevronDownIcon />
            </button>
            <IconButton
              label="Search"
              onClick={() => {
                setQuery("");
                setCommand("search");
              }}
            >
              <I.SearchIcon />
            </IconButton>
            <IconButton label="Create new issue" onClick={() => openComposer()}>
              <I.ComposeIcon />
            </IconButton>
            {workspaceMenu && (
              <div className="r-workspace-menu">
                <button
                  onClick={() => {
                    setWorkspaceMenu(false);
                    navigate({ nav: "settings" });
                  }}
                >
                  <I.SettingsIcon />
                  Settings
                </button>
                <button
                  onClick={() => {
                    setWorkspaceMenu(false);
                    setHelp(true);
                  }}
                >
                  <I.HelpIcon />
                  Keyboard shortcuts
                </button>
              </div>
            )}
          </div>
          <nav className="r-nav">
            {(["inbox", "my-issues", "reviews", "agent"] as NavId[]).map(
              (nav) => navItem(nav),
            )}
            <details open className="r-nav-section">
              <summary>Workspace</summary>
              {(["initiatives", "projects", "views", "loops"] as NavId[]).map(
                (nav) => navItem(nav),
              )}
              <button
                className="r-nav-item"
                onClick={() => setPopover(popover === "workspace-more" ? null : "workspace-more")}
              >
                <I.MoreIcon />
                <span>More</span>
              </button>
              {popover === "workspace-more" && <div className="r-workspace-more">{(["documents","archive","settings"] as NavId[]).map(nav=>navItem(nav))}</div>}
            </details>
            <details open className="r-nav-section">
              <summary>Your teams</summary>
              <div className="r-team-name">
                <span className="r-team-avatar">
                  <I.HomeIcon />
                </span>
                Xxh
                <I.ChevronDownIcon />
              </div>
              {(
                ["team-home", "triage", "team-issues", "cycles"] as NavId[]
              ).map((nav) => navItem(nav, NAV_LABEL[nav], true))}
              <a className="r-cycle-nav" href="#/cycles/current">
                Current
              </a>
              <a className="r-cycle-nav" href="#/cycles/upcoming">
                Upcoming
              </a>
              {navItem("projects", "Projects", true)}
              {navItem("views", "Views", true)}
              {navItem("archive", "Archive", true)}
            </details>
            {data.favorites.length > 0 && (
              <div className="r-nav-section">
                <p>Favorites</p>
                {data.favorites.map((id) => {
                  const issue = data.issues.find((i) => i.id === id);
                  return issue ? (
                    <a key={id} className="r-nav-item" href={`#/issue/${id}`}>
                      <I.StarIcon />
                      <span>{issue.title}</span>
                    </a>
                  ) : null;
                })}
              </div>
            )}
            <div className="r-nav-section">
              <p>Try</p>
              <a className="r-nav-item" href="#/settings">
                <I.ImportIcon />
                <span>Import issues</span>
              </a>
              <button
                className="r-nav-item"
                disabled
                title="Invitations require a hosted workspace"
              >
                <I.PlusIcon />
                <span>Invite people</span>
              </button>
            </div>
          </nav>
          <div className="r-sidebar-bottom">
            <button
              aria-label="Help & shortcuts"
              title="Help & shortcuts"
              onClick={() => setHelp(true)}
            >
              <I.HelpIcon />
            </button>
          </div>
        </aside>
        <main id="main-content" className={`r-main ${peek ? "with-peek" : ""}`}>
          <div className="r-main-pane">
            {route.issueId ? (
              <IssueDetail
                key={route.issueId}
                id={route.issueId}
                onClose={() => navigate(previous)}
                onOpen={(id) => openIssue(id)}
                onCreateChild={(parentId) => openComposer({ relation: {issueId:parentId,mode:"parent"} })}
                onCreateRelated={(relation) => openComposer({ relation })}
              />
            ) : isList ? (
              <>
                <PageHeader
                  title={NAV_LABEL[route.nav]}
                  actions={
                    <Button
                      onClick={() =>
                        openComposer(
                          route.nav === "triage"
                            ? { initialStatus: "triage" }
                            : {},
                        )
                      }
                    >
                      <I.PlusIcon />
                      New issue
                    </Button>
                  }
                />
                <div className="r-list-toolbar">
                  {route.nav === "my-issues" ? (
                    <nav className="r-pill-tabs">
                      {["assigned", "created", "subscribed", "activity"].map(
                        (tab) => (
                          <a
                            href={`#/my-issues/${tab}`}
                            key={tab}
                            className={
                              (route.id ?? "assigned") === tab ? "active" : ""
                            }
                          >
                            {tab[0].toUpperCase() + tab.slice(1)}
                          </a>
                        ),
                      )}
                    </nav>
                  ) : (
                    <span>
                      {route.nav === "triage"
                        ? `${visible.length} issues to triage`
                        : "All issues"}
                    </span>
                  )}
                  <span className="r-push" />
                  {Object.values(filter).some(Boolean) && (
                    <Button onClick={() => setFilter({})}>Clear filters</Button>
                  )}
                  <div className="r-menu-anchor">
                    <IconButton
                      label="Add filter"
                      onClick={() =>
                        setPopover(popover === "filter" ? null : "filter")
                      }
                    >
                      <I.FilterIcon />
                    </IconButton>
                    {popover === "filter" && (
                      <FilterMenu
                        value={filter}
                        onChange={setFilter}
                        onClose={() => setPopover(null)}
                      />
                    )}
                  </div>
                  <div className="r-menu-anchor">
                    <IconButton
                      label="Display options"
                      onClick={() =>
                        setPopover(popover === "display" ? null : "display")
                      }
                    >
                      <I.DisplayIcon />
                    </IconButton>
                    {popover === "display" && (
                      <DisplayMenu
                        value={prefs}
                        onChange={setPrefs}
                        onClose={() => setPopover(null)}
                      />
                    )}
                  </div>
                  <IconButton
                    label="Open details"
                    onClick={() => {
                      if (selected ?? visible[0]?.id)
                        setPeek(selected ?? visible[0].id);
                    }}
                  >
                    <I.PanelIcon />
                  </IconButton>
                </div>
                {route.nav === "my-issues" && route.id === "activity" ? (
                  <div className="r-activity-feed">
                    {data.activity.map((a) => (
                      <button key={a.id} onClick={() => openIssue(a.issueId)}>
                        <span className="r-issue-id">{a.issueId}</span>
                        {a.text}
                        <span className="r-push" />
                        <time>{a.time}</time>
                      </button>
                    ))}
                  </div>
                ) : (
                  <IssueList
                    issues={visible}
                    prefs={prefs}
                    onOpen={openIssue}
                    onCreate={(status) =>
                      openComposer({
                        initialStatus:
                          status ??
                          (route.nav === "triage" ? "triage" : undefined),
                      })
                    }
                    selectedId={selected}
                    onSelect={setSelected}
                  />
                )}
              </>
            ) : route.nav === "inbox" ? (
              <InboxPage {...props} />
            ) : route.nav === "projects" ? (
              <ProjectPages {...props} />
            ) : route.nav === "initiatives" ? (
              <InitiativesPage {...props} />
            ) : route.nav === "cycles" ? (
              <CyclesPage {...props} />
            ) : route.nav === "reviews" ? (
              <ReviewsPage {...props} />
            ) : route.nav === "agent" ? (
              <AgentPage {...props} />
            ) : route.nav === "loops" ? (
              <LoopsPage {...props} />
            ) : route.nav === "views" ? (
              <ViewsPage {...props} />
            ) : route.nav === "documents" ? (
              <DocumentsPage route={route} />
            ) : route.nav === "archive" ? (
              <ArchivePage {...props} />
            ) : route.nav === "team-home" ? (
              <HomePage {...props} />
            ) : (
              <SettingsPage />
            )}
            {!route.issueId && route.nav !== "agent" && (
              <div className="r-agent-bottom">
                <button onClick={() => navigate({ nav: "agent" })}>
                  <I.AgentIcon />
                  Agent
                </button>
                <IconButton
                  label="Chat history"
                  onClick={() =>
                    navigate({ nav: "agent", id: data.chats[0]?.id })
                  }
                >
                  <I.HistoryIcon />
                </IconButton>
              </div>
            )}
          </div>
          {peek && (
            <aside className="r-peek">
              <IssueDetail
                key={peek}
                id={peek}
                peek
                onClose={() => setPeek(null)}
                onOpen={(id) => openIssue(id)}
                onCreateChild={(parentId) => openComposer({ relation: {issueId:parentId,mode:"parent"} })}
                onCreateRelated={(relation) => openComposer({ relation })}
              />
            </aside>
          )}
        </main>
      </div>
      {deleteIssueId && <DeleteIssueDialog id={deleteIssueId} onClose={() => setDeleteIssueId(null)} />}
      {composer && (
        <IssueComposer
          {...composer}
          onClose={() => setComposer(null)}
          onCreated={(id) => openIssue(id)}
        />
      )}
      {command && (
        <Dialog
          wide
          title={command === "search" ? "Search" : "Command menu"}
          onClose={() => setCommand(null)}
        >
          <div className="r-command">
            <div className="r-command-input">
              <I.SearchIcon />
              <input
                autoFocus
                aria-label="Search commands and workspace"
                placeholder={
                  command === "search"
                    ? "Search issues, projects, views…"
                    : "Type a command or search…"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>esc</kbd>
            </div>
            <div className="r-command-results">
              {commands.map((c, index) => (
                <div key={`${c.group}-${c.label}-${index}`}>
                  {commands[index - 1]?.group !== c.group && <p>{c.group}</p>}
                  <button
                    className={index === commandIndex ? "active" : ""}
                    onMouseEnter={() => setCommandIndex(index)}
                    onClick={() => {
                      c.run();
                      setCommand(null);
                    }}
                  >
                    <span>{c.label}</span>
                    <kbd>{c.hint}</kbd>
                  </button>
                </div>
              ))}
              {!commands.length && (
                <Empty
                  title="No results found"
                  description="Try searching by issue ID or name."
                />
              )}
            </div>
          </div>
        </Dialog>
      )}
      {quick && current && (
        <Dialog
          title={`Change ${quick} · ${current.id}`}
          onClose={() => setQuick(null)}
        >
          <QuickEditor
            kind={quick}
            issueId={current.id}
            onClose={() => setQuick(null)}
          />
        </Dialog>
      )}
      {help && (
        <Dialog title="Keyboard shortcuts" onClose={() => setHelp(false)}>
          <div className="r-shortcuts">
            {[
              ["Command menu", "⌘ K"],
              ["Search", "/"],
              ["New issue", "C"],
              ["Open selected issue", "Enter"],
              ["Peek selected issue", "Space"],
              ["Move selection", "J / K"],
              ["Change status", "S"],
              ["Set priority", "P"],
              ["Assign", "A"],
              ["Edit labels", "L"],
              ["Toggle sidebar", "["],
              ["Go to Inbox", "G then I"],
              ["Go to My issues", "G then M"],
              ["Go to Reviews", "G then R"],
              ["Go to Agent", "G then J"],
              ["Go to Projects", "G then P"],
              ["Go to Views", "G then U"],
              ["Go to Cycles", "G then C"],
              ["Go to Triage", "G then T"],
              ["Go to Initiatives", "G then N"],
              ["Go to Loops", "G then L"],
              ["Submit issue / comment", "⌘ Enter"],
            ].map(([label, key]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
        </Dialog>
      )}
      {recent && (
        <Dialog title="Recently viewed" onClose={() => setRecent(false)}>
          <div className="r-command-results">
            {recentRoutes.map((r, index) => (
              <button
                key={index}
                onClick={() => {
                  navigate(r);
                  setRecent(false);
                }}
              >
                {r.issueId ?? NAV_LABEL[r.nav]} {r.id}
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {syncReview && <Dialog title="Changes from another window" onClose={()=>setSyncReview(false)}>
        <div className="r-document"><p>{workspace.saveError}</p><p>Your changes are still available in this window. Keeping your conflicting values preserves unrelated saved changes. Reloading the saved workspace discards unsaved changes in this window.</p>
          <footer><Button onClick={()=>setSyncReview(false)}>Keep editing</Button><Button onClick={()=>void workspace.useSharedChanges().then(()=>setSyncReview(false)).catch(error=>showToast(String(error)))}>Reload saved workspace</Button><Button primary onClick={()=>{workspace.keepLocalChanges();setSyncReview(false);}}>Keep my conflicting changes</Button></footer>
        </div>
      </Dialog>}
      {saveState === "error" && (
        <div className="r-storage-warning" role="alert">
          Changes remain in memory. {workspace.saveError}
          <Button onClick={workspace.retrySave}>Retry save</Button>
          <Button onClick={() => navigate({ nav: "settings" })}>
            Export backup
          </Button>
        </div>
      )}
      {toast && (
        <div className="r-toast" role="status" onClick={() => showToast("")}>
          {toast}
        </div>
      )}
    </div>
  );
}
function QuickEditor({
  kind,
  issueId,
  onClose,
}: {
  kind: "status" | "priority" | "assignee" | "labels";
  issueId: string;
  onClose: () => void;
}) {
  const workspace = useWorkspace(),
    data = useData();
  const issue = data.issues.find((i) => i.id === issueId)!;
  const [labels, setLabels] = useState(issue.labels.join(", "));
  return kind === "status" ? (
    <div className="r-quick-options">
      {ISSUE_STATUSES.map((s) => (
        <button
          key={s}
          onClick={() => {
            workspace.updateIssue(
              issueId,
              { status: s },
              `changed status to ${STATUS_LABEL[s]}`,
            );
            onClose();
          }}
        >
          <Status status={s} />
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  ) : kind === "priority" ? (
    <div className="r-quick-options">
      {PRIORITY_LABEL.map((p, i) => (
        <button
          key={p}
          onClick={() => {
            workspace.updateIssue(
              issueId,
              { priority: i as Priority },
              "updated priority",
            );
            onClose();
          }}
        >
          <I.PriorityIcon level={i as Priority} />
          {p}
        </button>
      ))}
    </div>
  ) : kind === "assignee" ? (
    <div className="r-quick-options">
      {[
        "",
        ...new Set([
          data.settings.user,
          ...data.issues.flatMap((i) => (i.assignee ? [i.assignee] : [])),
        ]),
      ].map((name) => (
        <button
          key={name}
          onClick={() => {
            workspace.updateIssue(
              issueId,
              { assignee: name || null },
              "updated assignee",
            );
            onClose();
          }}
        >
          <I.PersonIcon />
          {name || "Unassigned"}
        </button>
      ))}
    </div>
  ) : (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        workspace.updateIssue(
          issueId,
          {
            labels: labels
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          },
          "updated labels",
        );
        onClose();
      }}
    >
      <Field label="Labels">
        <input
          autoFocus
          value={labels}
          onChange={(e) => setLabels(e.target.value)}
        />
      </Field>
      <footer>
        <Button primary type="submit">
          Save labels
        </Button>
      </footer>
    </form>
  );
}
export type { WorkspaceData };

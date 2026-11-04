import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createKernel,
  explainViewFilter,
  ISSUE_GROUPINGS,
  type IssuePatch,
  type ProductKernel,
  type ProjectPatch,
  type ViewFilterExplanation,
} from "./kernel";
import {
  CURRENT_USER,
  TEAM_KEY,
  seedActivity,
  seedInbox,
  seedInitiatives,
  seedIssues,
  seedMilestones,
  seedProjects,
  seedReviews,
  seedViews,
} from "./data";
import {
  AgentIcon,
  BackIcon,
  BellIcon,
  CalendarIcon,
  CheckTinyIcon,
  ChevronDownIcon,
  CloseIcon,
  ComposeIcon,
  CubeIcon,
  DisplayIcon,
  DocsIcon,
  EmptyMark,
  FilterIcon,
  ForwardIcon,
  GitHubIcon,
  GripIcon,
  HelpIcon,
  HistoryIcon,
  HomeIcon,
  ImportIcon,
  InboxIcon,
  IssuesIcon,
  LabelIcon,
  LoopsIcon,
  MoreIcon,
  PanelIcon,
  PersonIcon,
  PlusIcon,
  PriorityIcon,
  ReviewsIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  SparkIcon,
  StarIcon,
  StatusBacklogIcon,
  StatusCanceledIcon,
  StatusDoneIcon,
  StatusProgressIcon,
  StatusTodoIcon,
  ViewsIcon,
} from "./icons";
import {
  STATUSES,
  STATUS_LABEL,
  hashFor,
  isSidebarNavActive,
  nextProjectStatus,
  nextStatus,
  parseHash,
  toFrame,
  type ProjectsViewsSection,
  type SidebarNavSection,
} from "./logic";
import { ProjectList, ProjectPage, ViewList } from "./screens";
import type {
  Activity,
  Frame,
  InboxItem,
  Issue,
  IssueGroup,
  IssueGrouping,
  IssueStatus,
  IssueTab,
  NavId,
  Priority,
  Project,
  Review,
  StatusFilter,
  ViewLayout,
} from "./types";

const TABS: { id: IssueTab; label: string }[] = [
  { id: "assigned", label: "Assigned" },
  { id: "created", label: "Created" },
  { id: "subscribed", label: "Subscribed" },
  { id: "activity", label: "Activity" },
];

const EMPTY: Record<IssueTab, string> = {
  assigned: "No issues assigned to you",
  created: "No issues created by you",
  subscribed: "No issues you are subscribed to",
  activity: "No activity yet",
};

const SHORTCUT_GROUPS: { group: string; items: { label: string; keys: string }[] }[] = [
  {
    group: "General",
    items: [
      { label: "Open command menu", keys: "⌘K" },
      { label: "Save or submit", keys: "⌘Enter" },
      { label: "Send comment", keys: "Enter" },
      { label: "Back", keys: "Esc" },
      { label: "Open search", keys: "/" },
      { label: "Open help menu", keys: "?" },
      { label: "View keyboard shortcuts", keys: "⌘/" },
      { label: "Switch workspace", keys: "O then W" },
    ],
  },
  {
    group: "Navigation",
    items: [
      { label: "Toggle left sidebar", keys: "[" },
      { label: "Toggle right sidebar", keys: "]" },
      { label: "Open issue", keys: "O then I" },
      { label: "Go to inbox", keys: "G then I" },
      { label: "Go to Agent", keys: "G then J" },
      { label: "Go to my issues", keys: "G then M" },
      { label: "Go to reviews", keys: "G then R" },
      { label: "Go to projects", keys: "G then P" },
      { label: "Go to views", keys: "G then V" },
      { label: "Open settings", keys: "O then S" },
    ],
  },
  {
    group: "Issue lists",
    items: [
      { label: "Move selection down", keys: "J" },
      { label: "Move selection up", keys: "K" },
      { label: "Open selected issue", keys: "Enter" },
      { label: "Select issue", keys: "X" },
      { label: "Change status", keys: "S" },
      { label: "Set priority", keys: "P" },
      { label: "Assign to…", keys: "A" },
      { label: "Add labels", keys: "L" },
    ],
  },
  {
    group: "Create",
    items: [
      { label: "New issue", keys: "C" },
      { label: "New project", keys: "N then P" },
    ],
  },
];

function StatusIcon({ status }: { status: IssueStatus }) {
  if (status === "backlog") return <StatusBacklogIcon />;
  if (status === "progress") return <StatusProgressIcon />;
  if (status === "done") return <StatusDoneIcon />;
  if (status === "canceled") return <StatusCanceledIcon />;
  return <StatusTodoIcon />;
}

function nowStamp() {
  return "now";
}

export default function App() {
  const boot = parseHash();
  const kernelRef = useRef<ProductKernel | null>(null);
  if (kernelRef.current === null) {
    kernelRef.current = createKernel({
      viewer: CURRENT_USER,
      teamKey: TEAM_KEY,
      issues: seedIssues,
      projects: seedProjects,
      views: seedViews,
      milestones: seedMilestones,
    });
  }
  const kernel = kernelRef.current;
  const [nav, setNav] = useState<NavId>(boot.nav);
  const [tab, setTab] = useState<IssueTab>(boot.tab);
  const [issues, setIssues] = useState<Issue[]>(() => kernel.issues());
  const [projects, setProjects] = useState<Project[]>(() => kernel.projects());
  const [listGrouping, setListGrouping] = useState<IssueGrouping>("status");
  const views = kernel.views();
  const [milestones] = useState(seedMilestones);
  const [initiatives] = useState(seedInitiatives);
  const [activity, setActivity] = useState<Activity[]>(seedActivity);
  const [inbox, setInbox] = useState<InboxItem[]>(seedInbox);
  const [reviews, setReviews] = useState<Review[]>(seedReviews);
  const [composerOpen, setComposerOpen] = useState(boot.composer);
  const [commandOpen, setCommandOpen] = useState(boot.command);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftStatus, setDraftStatus] = useState<IssueStatus>("backlog");
  const [draftProjectId, setDraftProjectId] = useState<string | null>(boot.projectId);
  const [draftLabels, setDraftLabels] = useState<string[]>([]);
  const [createMore, setCreateMore] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [issueId, setIssueId] = useState<string | null>(boot.issueId);
  const [projectId, setProjectId] = useState<string | null>(boot.projectId);
  const [viewId, setViewId] = useState<string | null>(boot.viewId);
  const [projectTab, setProjectTab] = useState(boot.projectTab);
  const [cursorId, setCursorId] = useState<string | null>(boot.issueId);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcutQuery, setShortcutQuery] = useState("");
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [listStatusOpen, setListStatusOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showPriority, setShowPriority] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [workspace, setWorkspace] = useState("xxh");
  const [projectsViewsSection, setProjectsViewsSection] = useState<ProjectsViewsSection>("workspace");
  const [sections, setSections] = useState({ workspace: true, teams: true, try: true, team: true });
  const [history, setHistory] = useState<Frame[]>([
    toFrame({
      nav: boot.nav,
      tab: boot.tab,
      issueId: boot.issueId,
      projectId: boot.projectId,
      viewId: boot.viewId,
      projectTab: boot.projectTab,
    }),
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [agentMessages, setAgentMessages] = useState<string[]>(["Ask about an issue, or type a title to draft one."]);
  const [agentDraft, setAgentDraft] = useState("");
  const [comment, setComment] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const commandRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const shortcutRef = useRef<HTMLInputElement>(null);
  const chordRef = useRef<string | null>(null);
  const chordTimer = useRef(0);

  const activeProject = projects.find((project) => project.id === projectId) ?? null;
  const activeView = (viewId && kernel.getCustomView(viewId)) || null;
  const reviewDot = reviews.some((item) => !item.approved);
  const visible = useMemo(() => {
    let listed = kernel.issues();
    if (nav === "views" && activeView) {
      listed = kernel.customViewIssues(activeView.id);
    } else if (nav === "projects" && activeProject) {
      listed = kernel.projectIssues(activeProject.id);
    } else if (nav === "team-issues") {
      listed = kernel.teamIssues();
    } else if (nav === "my-issues") {
      if (tab === "assigned") listed = kernel.myIssuesAssigned();
      else if (tab === "created") listed = kernel.myIssuesCreated();
      else if (tab === "subscribed") listed = kernel.myIssuesSubscribed();
    }
    return listed.filter((issue) => {
      if (filter !== "all" && issue.status !== filter) return false;
      if (!showCompleted && (issue.status === "done" || issue.status === "canceled")) return false;
      return true;
    });
  }, [activeProject, activeView, filter, issues, kernel, nav, showCompleted, tab]);

  const selected = issues.find((issue) => issue.id === issueId) ?? null;
  const pageTitle =
    selected && !panelOpen
      ? selected.id
      : (activeProject?.name ?? activeView?.name ?? labelForNav(nav));

  const grouped = useMemo(
    () => kernel.groupIssues(visible, activeView?.grouping ?? listGrouping),
    [activeView, kernel, listGrouping, visible],
  );

  const selectedIssue = cursorId ? issues.find((issue) => issue.id === cursorId) ?? null : null;

  const commands = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    const items: { id: string; title: string; hint: string; group: string; run: () => void }[] = [];
    if (selectedIssue) {
      items.push(
        { id: "assign", title: "Assign to…", hint: "A", group: "Issue", run: () => flash("Assign to…") },
        { id: "assign-me", title: "Assign to me", hint: "I", group: "Issue", run: () => patchIssue(selectedIssue.id, { assignee: kernel.viewer }, "Assigned to you") },
        { id: "status", title: "Change status…", hint: "S", group: "Issue", run: () => setListStatusOpen(true) },
        { id: "priority", title: "Set priority…", hint: "P", group: "Issue", run: () => cyclePriority(selectedIssue.id) },
        { id: "labels", title: "Add labels…", hint: "L", group: "Issue", run: () => flash("Labels") },
        { id: "copy-id", title: "Copy issue ID", hint: "⌘.", group: "Issue", run: () => {
          void navigator.clipboard.writeText(selectedIssue.id);
          flash("Copied ID");
        } },
      );
    }
    items.push(
      { id: "new", title: "Create new issue…", hint: "C", group: "Issues", run: () => openComposer() },
      { id: "new-project", title: "Create new project…", hint: "N then P", group: "Issues", run: () => createProject() },
      { id: "inbox", title: "Go to Inbox", hint: "G then I", group: "Navigation", run: () => go({ nav: "inbox" }) },
      { id: "mine", title: "Go to My issues", hint: "G then M", group: "Navigation", run: () => go({ nav: "my-issues", tab: "assigned" }) },
      { id: "reviews", title: "Go to Reviews", hint: "G then R", group: "Navigation", run: () => go({ nav: "reviews" }) },
      { id: "agent", title: "Go to Agent", hint: "G then J", group: "Navigation", run: () => go({ nav: "agent" }) },
      { id: "projects", title: "Go to Projects", hint: "G then P", group: "Navigation", run: () => go({ nav: "projects" }) },
      { id: "views", title: "Go to Views", hint: "G then V", group: "Navigation", run: () => go({ nav: "views" }) },
      { id: "settings", title: "Open settings…", hint: "O then S", group: "Navigation", run: () => flash("Settings") },
      { id: "shortcuts", title: "View keyboard shortcuts", hint: "⌘/", group: "Help", run: () => setShortcutsOpen(true) },
    );
    for (const project of projects) {
      items.push({
        id: `project-${project.id}`,
        title: project.name,
        hint: "Project",
        group: "Projects",
        run: () => openProject(project.id),
      });
    }
    for (const view of views) {
      items.push({
        id: `view-${view.id}`,
        title: view.name,
        hint: view.shared ? "Shared view" : "Private view",
        group: "Views",
        run: () => openView(view.id),
      });
    }
    for (const issue of issues) {
      items.push({
        id: `open-${issue.id}`,
        title: `${issue.id}  ${issue.title}`,
        hint: STATUS_LABEL[issue.status],
        group: "Issues",
        run: () => openIssue(issue.id),
      });
    }
    return items.filter((item) => !q || item.title.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q) || item.group.toLowerCase().includes(q));
  }, [commandQuery, issues, projects, selectedIssue, views, workspace]);

  useEffect(() => {
    setCommandIndex(0);
  }, [commandQuery, commandOpen]);

  useEffect(() => {
    if (commandOpen) commandRef.current?.focus();
  }, [commandOpen]);

  useEffect(() => {
    if (shortcutsOpen) shortcutRef.current?.focus();
  }, [shortcutsOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onHash() {
      const parsed = parseHash();
      setNav(parsed.nav);
      setTab(parsed.tab);
      setIssueId(parsed.issueId);
      setProjectId(parsed.projectId);
      setViewId(parsed.viewId);
      setProjectTab(parsed.projectTab);
      setComposerOpen(parsed.composer);
      setCommandOpen(parsed.command);
      if (parsed.issueId) setCursorId(parsed.issueId);
    }
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) {
      window.history.replaceState(
        null,
        "",
        hashFor(
          toFrame({
            nav: boot.nav,
            tab: boot.tab,
            issueId: boot.issueId,
            projectId: boot.projectId,
            viewId: boot.viewId,
            projectTab: boot.projectTab,
          }),
        ),
      );
    }
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    function armChord(prefix: string) {
      chordRef.current = prefix;
      window.clearTimeout(chordTimer.current);
      chordTimer.current = window.setTimeout(() => {
        chordRef.current = null;
      }, 800);
    }

    function onKey(event: KeyboardEvent) {
      const typing =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      const key = event.key;
      const lower = key.toLowerCase();
      const meta = event.metaKey || event.ctrlKey;

      if (meta && lower === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
        setComposerOpen(false);
        setShortcutsOpen(false);
        return;
      }
      if (meta && key === "/") {
        event.preventDefault();
        setShortcutsOpen((open) => !open);
        setShortcutQuery("");
        setCommandOpen(false);
        return;
      }
      if (composerOpen && meta && key === "Enter") {
        event.preventDefault();
        createIssue();
        return;
      }
      if (key === "Escape") {
        if (commandOpen) return void setCommandOpen(false);
        if (shortcutsOpen) return void setShortcutsOpen(false);
        if (statusMenuOpen) return void setStatusMenuOpen(false);
        if (listStatusOpen) return void setListStatusOpen(false);
        if (composerOpen) return void setComposerOpen(false);
        if (helpOpen || filterOpen || displayOpen || workspaceOpen || moreOpen) {
          setHelpOpen(false);
          setFilterOpen(false);
          setDisplayOpen(false);
          setWorkspaceOpen(false);
          setMoreOpen(false);
          return;
        }
        if (issueId) {
          if (historyIndex > 0) back();
          else {
            setIssueId(null);
            setPanelOpen(false);
          }
        }
        return;
      }
      if (commandOpen) {
        if (key === "ArrowDown") {
          event.preventDefault();
          setCommandIndex((index) => Math.min(index + 1, Math.max(commands.length - 1, 0)));
        } else if (key === "ArrowUp") {
          event.preventDefault();
          setCommandIndex((index) => Math.max(index - 1, 0));
        } else if (key === "Enter") {
          event.preventDefault();
          commands[commandIndex]?.run();
          setCommandOpen(false);
        }
        return;
      }
      if (shortcutsOpen) return;
      if ((statusMenuOpen || listStatusOpen) && /^[1-5]$/.test(key)) {
        const index = Number(key) - 1;
        event.preventDefault();
        if (statusMenuOpen) {
          setDraftStatus(STATUSES[index]);
          setStatusMenuOpen(false);
        } else if (cursorId) {
          patchIssue(cursorId, { status: STATUSES[index] }, `Status changed to ${STATUS_LABEL[STATUSES[index]]}`);
          setListStatusOpen(false);
        }
        return;
      }
      if (composerOpen && !typing && lower === "s") {
        event.preventDefault();
        setStatusMenuOpen((open) => !open);
        return;
      }
      if (typing) return;

      const chord = chordRef.current;
      if (chord) {
        event.preventDefault();
        chordRef.current = null;
        window.clearTimeout(chordTimer.current);
        if (chord === "g") {
          if (lower === "i") go({ nav: "inbox" });
          else if (lower === "m") go({ nav: "my-issues", tab: "assigned" });
          else if (lower === "j") go({ nav: "agent" });
          else if (lower === "r") go({ nav: "reviews" });
          else if (lower === "p") go({ nav: "projects" });
          else if (lower === "v") go({ nav: "views" });
          else if (lower === "a") go({ nav: "my-issues", tab: "assigned" });
        } else if (chord === "o") {
          if (lower === "i" && cursorId) openIssue(cursorId);
          else if (lower === "s") flash("Settings");
          else if (lower === "w") setWorkspaceOpen(true);
        } else if (chord === "n") {
          if (lower === "p") createProject();
        }
        return;
      }

      if (lower === "g" || lower === "o" || lower === "n") {
        event.preventDefault();
        armChord(lower);
        return;
      }
      if (lower === "c") {
        event.preventDefault();
        openComposer();
      } else if (key === "/") {
        event.preventDefault();
        setCommandOpen(true);
      } else if (key === "?") {
        event.preventDefault();
        setHelpOpen(true);
      } else if (key === "[") {
        event.preventDefault();
        setSidebarHidden((value) => !value);
      } else if (key === "]") {
        event.preventDefault();
        setPanelOpen((value) => !value);
      } else if (lower === "s" && cursorId) {
        event.preventDefault();
        setListStatusOpen((open) => !open);
      } else if (lower === "p" && cursorId) {
        event.preventDefault();
        cyclePriority(cursorId);
      } else if (lower === "x" && cursorId) {
        event.preventDefault();
        toggleChecked(cursorId);
      } else if (key === "j" || key === "k") {
        if (!visible.length) return;
        event.preventDefault();
        const ids = visible.map((issue) => issue.id);
        const current = cursorId && ids.includes(cursorId) ? ids.indexOf(cursorId) : event.key === "j" ? -1 : 0;
        const next = event.key === "j" ? Math.min(current + 1, ids.length - 1) : Math.max(current - 1, 0);
        setCursorId(ids[next]);
        setListStatusOpen(false);
        if (panelOpen) openIssue(ids[next], false, true);
      } else if (event.key === "Enter" && cursorId) {
        event.preventDefault();
        openIssue(cursorId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    commandIndex,
    commandOpen,
    commands,
    composerOpen,
    cursorId,
    statusMenuOpen,
    listStatusOpen,
    displayOpen,
    filterOpen,
    helpOpen,
    moreOpen,
    issueId,
    panelOpen,
    shortcutsOpen,
    tab,
    visible,
    workspaceOpen,
    historyIndex,
    projectId,
    viewId,
  ]);

  function flash(message: string) {
    setToast(message);
  }

  function selectSidebarNav(id: NavId, section: SidebarNavSection, extras: Partial<Frame> = {}) {
    if ((id === "projects" || id === "views") && (section === "workspace" || section === "team")) {
      setProjectsViewsSection(section);
    }
    go({ nav: id, ...extras });
  }

  function go(partial: Partial<Frame> & { nav: NavId }, record = true) {
    const frame = toFrame(partial, partial.tab ?? tab);
    setNav(frame.nav);
    setTab(frame.tab);
    setIssueId(frame.issueId);
    setProjectId(frame.projectId);
    setViewId(frame.viewId);
    setProjectTab(frame.projectTab);
    if (frame.issueId) setCursorId(frame.issueId);
    else setPanelOpen(false);
    const nextHash = hashFor(frame);
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
    if (record) {
      setHistory((current) => {
        const next = [...current.slice(0, historyIndex + 1), frame];
        setHistoryIndex(next.length - 1);
        return next;
      });
    }
    setFilterOpen(false);
    setDisplayOpen(false);
    setHelpOpen(false);
    setWorkspaceOpen(false);
    setMoreOpen(false);
    setListStatusOpen(false);
    setShortcutsOpen(false);
  }

  function back() {
    if (historyIndex <= 0) return;
    const index = historyIndex - 1;
    setHistoryIndex(index);
    const frame = history[index];
    go(frame, false);
  }

  function forward() {
    if (historyIndex >= history.length - 1) return;
    const index = historyIndex + 1;
    setHistoryIndex(index);
    go(history[index], false);
  }

  function openComposer(status: IssueStatus = "backlog") {
    setDraftTitle("");
    setDraftBody("");
    setDraftStatus(status);
    setDraftProjectId(projectId ?? activeView?.filter.projectId ?? null);
    setDraftLabels(activeView?.filter.labels ?? []);
    setStatusMenuOpen(false);
    setComposerOpen(true);
    setCommandOpen(false);
  }

  function openProject(id: string) {
    go({ nav: "projects", projectId: id, projectTab: "overview" });
  }

  function openView(id: string) {
    go({ nav: "views", viewId: id });
  }

  function patchProject(id: string, update: ProjectPatch) {
    const result = kernel.updateProject(id, update);
    if (!result.ok) return;
    setProjects(kernel.projects());
  }

  function createProject() {
    const project = kernel.createProject({ name: "Untitled project" });
    setProjects(kernel.projects());
    go({ nav: "projects", projectId: project.id, projectTab: "overview" });
    flash("Project created");
  }

  function openIssue(id: string, record = true, peek = false) {
    const issue = kernel.getIssue(id);
    const nextNav: NavId = nav === "team-issues" ? "team-issues" : "my-issues";
    const nextTab: IssueTab =
      issue?.assignee === kernel.viewer ? "assigned" : issue?.creator === kernel.viewer ? "created" : "subscribed";
    go({ nav: nextNav, tab: nav === "team-issues" ? tab : nextTab, issueId: id }, record);
    setInbox((current) => current.map((item) => (item.issueId === id ? { ...item, read: true } : item)));
    setPanelOpen(peek);
    setCommandOpen(false);
    setListStatusOpen(false);
  }

  function log(issueId: string, text: string) {
    const entry = { id: `a${Date.now()}`, issueId, text, time: nowStamp() };
    setActivity((current) => [entry, ...current]);
  }

  function notify(issueId: string, text: string) {
    setInbox((current) => [
      { id: `n${Date.now()}`, issueId, text, time: nowStamp(), read: false },
      ...current,
    ]);
  }

  function syncIssues() {
    setIssues(kernel.issues());
  }

  function createIssue() {
    const title = draftTitle.trim();
    if (!title) return;
    const next = kernel.createIssue({
      title,
      body: draftBody.trim(),
      status: draftStatus,
      date: "Nov 2",
      labels: draftLabels,
      projectId: draftProjectId ?? undefined,
    });
    syncIssues();
    log(next.id, "You created this issue");
    notify(next.id, `${next.id} created`);
    if (createMore) {
      setDraftTitle("");
      setDraftBody("");
      setDraftStatus("backlog");
      setStatusMenuOpen(false);
      queueMicrotask(() => titleRef.current?.focus());
    } else {
      setComposerOpen(false);
      openIssue(next.id);
    }
    flash("Issue created");
  }

  function patchIssue(id: string, update: IssuePatch, activityText?: string) {
    const result = kernel.updateIssue(id, update);
    if (!result.ok) {
      if (result.error === "invalid-milestone" || result.error === "unknown-milestone") {
        flash("Milestone must belong to the Issue’s Project");
      }
      return;
    }
    syncIssues();
    if (activityText) {
      log(id, activityText);
      notify(id, activityText);
    }
  }

  function cycleProject(id: string) {
    const issue = kernel.getIssue(id);
    if (!issue) return;
    const ids: Array<string | null> = [null, ...kernel.projects().map((item) => item.id)];
    const index = ids.indexOf(issue.projectId ?? null);
    const next = ids[(index + 1) % ids.length] ?? null;
    patchIssue(id, { projectId: next }, next ? "Added to project" : "Removed from project");
  }

  function cycleMilestone(id: string) {
    const issue = kernel.getIssue(id);
    if (!issue) return;
    const owned = issue.projectId ? milestones.filter((item) => item.projectId === issue.projectId) : [];
    const ids: Array<string | null> = [null, ...owned.map((item) => item.id)];
    const index = ids.indexOf(issue.milestoneId ?? null);
    const next = ids[(index + 1) % ids.length] ?? null;
    patchIssue(id, { milestoneId: next }, next ? "Milestone updated" : "Milestone cleared");
  }

  function cycleStatus(id: string) {
    const issue = kernel.getIssue(id);
    if (!issue) return;
    const status = nextStatus(issue.status);
    patchIssue(id, { status }, `Status changed to ${STATUS_LABEL[status]}`);
  }

  function cyclePriority(id: string) {
    const issue = kernel.getIssue(id);
    if (!issue) return;
    const priority = ((issue.priority + 1) % 5) as Priority;
    patchIssue(id, { priority }, "Priority updated");
  }

  function toggleChecked(id: string) {
    setCheckedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function addComment(id: string) {
    const text = comment.trim();
    if (!text) return;
    log(id, `You: ${text}`);
    setComment("");
    flash("Comment added");
  }

  function sendAgent() {
    const text = agentDraft.trim();
    if (!text) return;
    setAgentMessages((current) => [...current, text, `Drafted a note on “${text}”. Press C to turn it into an issue.`]);
    setAgentDraft("");
  }

  return (
    <div
      className={sidebarHidden ? "app sidebar-collapsed" : "app"}
      onClick={() => {
        setFilterOpen(false);
        setDisplayOpen(false);
        setHelpOpen(false);
        setWorkspaceOpen(false);
        setMoreOpen(false);
        setListStatusOpen(false);
      }}
    >
      <header className="titlebar">
        <div className="titlebar-left">
          <div className="traffic" aria-hidden="true">
            <span className="close" />
            <span className="min" />
            <span className="zoom" />
          </div>
          <button className="tb-icon" type="button" aria-label="Inbox" onClick={() => go({ nav: "inbox" })}>
            <InboxIcon />
          </button>
          <button className="tb-icon" type="button" aria-label="Views" onClick={() => go({ nav: "views" })}>
            <CalendarIcon />
          </button>
        </div>
        <div className="titlebar-center">
          <div className="history">
            <button className="tb-icon" type="button" aria-label="Back" disabled={historyIndex <= 0} onClick={back}>
              <BackIcon />
            </button>
            <button
              className="tb-icon"
              type="button"
              aria-label="Forward"
              disabled={historyIndex >= history.length - 1}
              onClick={forward}
            >
              <ForwardIcon />
            </button>
          </div>
          <button className="search" type="button" aria-label="Search" onClick={() => setCommandOpen(true)}>
            <SearchIcon />
            <span>Search…</span>
            <kbd>⌘K</kbd>
          </button>
          <button className="tb-icon" type="button" aria-label="New issue" onClick={() => openComposer()}>
            <PlusIcon />
          </button>
        </div>
      </header>

      <div className="body">
        <aside className="sidebar">
          <div className="workspace">
            <button
              className="workspace-name"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setWorkspaceOpen((open) => !open);
              }}
            >
              <span className="avatar">{workspace.slice(0, 2).toUpperCase()}</span>
              {workspace}
              <ChevronDownIcon />
            </button>
            {workspaceOpen ? (
              <div className="menu workspace-menu" onClick={(event) => event.stopPropagation()}>
                {["xxh", "acme"].map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={name === workspace ? "menu-item active" : "menu-item"}
                    onClick={() => {
                      setWorkspace(name);
                      setWorkspaceOpen(false);
                      flash(`Switched to ${name}`);
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="workspace-actions">
              <button className="tb-icon" type="button" aria-label="Search workspace" onClick={() => setCommandOpen(true)}>
                <SearchIcon />
              </button>
              <button className="tb-icon" type="button" aria-label="Create" onClick={() => openComposer()}>
                <ComposeIcon />
              </button>
            </div>
          </div>

          <nav className="nav">
            <NavButton
              id="inbox"
              section="top"
              current={nav}
              projectsViewsSection={projectsViewsSection}
              onSelect={(id) => selectSidebarNav(id, "top")}
              icon={<InboxIcon />}
              label="Inbox"
            />
            <NavButton
              id="my-issues"
              section="top"
              current={nav}
              projectsViewsSection={projectsViewsSection}
              onSelect={(id) => selectSidebarNav(id, "top", { tab: "assigned" })}
              icon={<IssuesIcon />}
              label="My issues"
            />
            <NavButton
              id="reviews"
              section="top"
              current={nav}
              projectsViewsSection={projectsViewsSection}
              onSelect={(id) => selectSidebarNav(id, "top")}
              icon={<ReviewsIcon />}
              label="Reviews"
              trailing={reviewDot ? <span className="dot" /> : null}
            />
            <NavButton
              id="agent"
              section="top"
              current={nav}
              projectsViewsSection={projectsViewsSection}
              onSelect={(id) => selectSidebarNav(id, "top")}
              icon={<AgentIcon />}
              label="Agent"
            />

            <div className={sections.workspace ? "section" : "section collapsed"}>
              <button
                className="section-label"
                type="button"
                onClick={() => setSections((current) => ({ ...current, workspace: !current.workspace }))}
              >
                Workspace
                <ChevronDownIcon />
              </button>
              {sections.workspace ? (
                <>
                  <NavButton
                    id="projects"
                    section="workspace"
                    current={nav}
                    projectsViewsSection={projectsViewsSection}
                    onSelect={(id) => selectSidebarNav(id, "workspace")}
                    icon={<CubeIcon />}
                    label="Projects"
                  />
                  <NavButton
                    id="views"
                    section="workspace"
                    current={nav}
                    projectsViewsSection={projectsViewsSection}
                    onSelect={(id) => selectSidebarNav(id, "workspace")}
                    icon={<ViewsIcon />}
                    label="Views"
                  />
                  <NavButton
                    id="loops"
                    section="workspace"
                    current={nav}
                    projectsViewsSection={projectsViewsSection}
                    onSelect={(id) => selectSidebarNav(id, "workspace")}
                    icon={<LoopsIcon />}
                    label="Loops"
                  />
                  <div className="more-wrap">
                    <button
                      className={moreOpen ? "nav-item active" : "nav-item"}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMoreOpen((open) => !open);
                      }}
                    >
                      <MoreIcon />
                      <span className="label">More</span>
                    </button>
                    {moreOpen ? (
                      <div className="menu more-menu" onClick={(event) => event.stopPropagation()}>
                        <button className="menu-item" type="button" onClick={() => flash("Docs")}>
                          <DocsIcon /> Docs
                        </button>
                        <button className="menu-item" type="button" onClick={() => flash("Contact us")}>
                          <PersonIcon /> Contact us
                        </button>
                        <button
                          className="menu-item"
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            setShortcutsOpen(true);
                          }}
                        >
                          <HelpIcon /> Keyboard shortcuts
                          <kbd className="push">⌘/</kbd>
                        </button>
                        <button
                          className="menu-item"
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            flash("Settings");
                          }}
                        >
                          <SettingsIcon /> Settings
                          <span className="push hint-inline">O then S</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            <div className={sections.teams ? "section" : "section collapsed"}>
              <button
                className="section-label"
                type="button"
                onClick={() => setSections((current) => ({ ...current, teams: !current.teams }))}
              >
                Your teams
                <ChevronDownIcon />
              </button>
              {sections.teams ? (
                <>
                  <button
                    className="nav-item"
                    type="button"
                    onClick={() => setSections((current) => ({ ...current, team: !current.team }))}
                  >
                    <HomeIcon className="team-icon" />
                    <span>Xxh</span>
                    <ChevronDownIcon />
                  </button>
                  {sections.team ? (
                    <>
                      <NavButton
                        id="team-home"
                        section="team"
                        current={nav}
                        projectsViewsSection={projectsViewsSection}
                        onSelect={(id) => selectSidebarNav(id, "team")}
                        icon={<HomeIcon />}
                        label="Home"
                        indent
                      />
                      <NavButton
                        id="team-issues"
                        section="team"
                        current={nav}
                        projectsViewsSection={projectsViewsSection}
                        onSelect={(id) => selectSidebarNav(id, "team", { tab: "assigned" })}
                        icon={<IssuesIcon />}
                        label="Issues"
                        indent
                      />
                      <NavButton
                        id="projects"
                        section="team"
                        current={nav}
                        projectsViewsSection={projectsViewsSection}
                        onSelect={(id) => selectSidebarNav(id, "team")}
                        icon={<CubeIcon />}
                        label="Projects"
                        indent
                      />
                      <NavButton
                        id="views"
                        section="team"
                        current={nav}
                        projectsViewsSection={projectsViewsSection}
                        onSelect={(id) => selectSidebarNav(id, "team")}
                        icon={<ViewsIcon />}
                        label="Views"
                        indent
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className={sections.try ? "section" : "section collapsed"}>
              <button
                className="section-label"
                type="button"
                onClick={() => setSections((current) => ({ ...current, try: !current.try }))}
              >
                Try
                <ChevronDownIcon />
              </button>
              {sections.try ? (
                <>
                  <button className="nav-item" type="button" onClick={() => flash("Imported 0 issues")}>
                    <ImportIcon />
                    <span className="label">Import issues</span>
                  </button>
                  <button className="nav-item" type="button" onClick={() => flash("Invite link copied")}>
                    <PlusIcon />
                    <span className="label">Invite people</span>
                  </button>
                  <button className="nav-item" type="button" onClick={() => flash("GitHub connected")}>
                    <GitHubIcon />
                    <span className="label">Connect GitHub</span>
                  </button>
                </>
              ) : null}
            </div>
          </nav>

          <div className="sidebar-footer">
            <button
              className="help"
              type="button"
              aria-label="Help"
              onClick={(event) => {
                event.stopPropagation();
                setHelpOpen((open) => !open);
              }}
            >
              <HelpIcon />
            </button>
            {helpOpen ? (
              <div className="menu help-menu" onClick={(event) => event.stopPropagation()}>
                <p className="menu-title">Shortcuts</p>
                <Shortcut keys="⌘K" label="Command menu" />
                <Shortcut keys="⌘/" label="Keyboard shortcuts" />
                <Shortcut keys="C" label="New issue" />
                <Shortcut keys="G then M" label="My issues" />
                <Shortcut keys="S" label="Change status" />
                <Shortcut keys="J / K" label="Move selection" />
                <Shortcut keys="Enter" label="Open issue" />
                <Shortcut keys="Esc" label="Close" />
              </div>
            ) : null}
          </div>
        </aside>

        <main className="main">
          <section className={panelOpen && selected && (nav === "my-issues" || nav === "team-issues") ? "board split" : "board"}>
            <div className="board-main">
              {selected && !panelOpen ? (
                <div className="board-header issue-crumb">
                  <div className="crumb">
                    <HomeIcon className="team-icon" />
                    <span>Xxh</span>
                    <span aria-hidden="true">›</span>
                    <span>{selected.projectId ? projects.find((project) => project.id === selected.projectId)?.name ?? "Issues" : "Issues"}</span>
                    <span aria-hidden="true">›</span>
                    <StatusIcon status={selected.status} />
                    <strong>{selected.id} {selected.title}</strong>
                    <StarIcon />
                  </div>
                  <button className="ghost-btn" type="button" onClick={() => openComposer()}>
                    <PlusIcon />
                    New issue
                  </button>
                </div>
              ) : activeProject ? null : (
                <div className="board-header">
                  <h1>{pageTitle}</h1>
                  {nav === "projects" ? (
                    <button className="ghost-btn" type="button" onClick={createProject}>
                      <PlusIcon />
                      New project
                    </button>
                  ) : (
                    <button className="ghost-btn" type="button" onClick={() => openComposer()}>
                      <PlusIcon />
                      New issue
                    </button>
                  )}
                </div>
              )}

              {(nav === "my-issues" || nav === "team-issues" || Boolean(activeView)) && !(selected && !panelOpen) ? (
                <div className="board-toolbar">
                  <div className="tabs">
                    {nav === "my-issues"
                      ? TABS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={item.id === tab ? "tab active" : "tab"}
                            onClick={() => go({ nav: "my-issues", tab: item.id })}
                          >
                            {item.label}
                          </button>
                        ))
                      : (
                          <>
                            {activeView ? <span className="chip">{activeView.grouping}</span> : null}
                            {activeView ? <span className="chip">{activeView.layout}</span> : null}
                            {activeView ? <span className="chip">{activeView.shared ? "Shared" : "Private"}</span> : null}
                            {nav === "team-issues" ? <span className="chip">Team</span> : null}
                          </>
                        )}
                  </div>
                  <div className="toolbar-actions">
                    <div className="popover" onClick={(event) => event.stopPropagation()}>
                      <button
                        className={filter !== "all" ? "round-btn on" : "round-btn"}
                        type="button"
                        aria-label="Filter"
                        onClick={() => setFilterOpen((open) => !open)}
                      >
                        <FilterIcon />
                      </button>
                      {filterOpen ? (
                        <div className="menu">
                          {(["all", ...STATUSES] as const).map((value) => (
                            <button
                              key={value}
                              type="button"
                              className={filter === value ? "menu-item active" : "menu-item"}
                              onClick={() => {
                                setFilter(value);
                                setFilterOpen(false);
                              }}
                            >
                              {value === "all" ? "All statuses" : STATUS_LABEL[value]}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="popover" onClick={(event) => event.stopPropagation()}>
                      <button className="round-btn" type="button" aria-label="Display" onClick={() => setDisplayOpen((open) => !open)}>
                        <DisplayIcon />
                      </button>
                      {displayOpen ? (
                        <div className="menu">
                          {!activeView
                            ? ISSUE_GROUPINGS.map((grouping) => (
                                <button
                                  key={grouping}
                                  className={listGrouping === grouping ? "menu-item active" : "menu-item"}
                                  type="button"
                                  onClick={() => {
                                    setListGrouping(grouping);
                                    setDisplayOpen(false);
                                  }}
                                >
                                  Group by {grouping}
                                </button>
                              ))
                            : null}
                          <button className="menu-item" type="button" onClick={() => setShowCompleted((value) => !value)}>
                            {showCompleted ? "Hide completed" : "Show completed"}
                          </button>
                          <button className="menu-item" type="button" onClick={() => setShowPriority((value) => !value)}>
                            {showPriority ? "Hide priority" : "Show priority"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <button
                      className={panelOpen ? "round-btn on" : "round-btn"}
                      type="button"
                      aria-label="Details"
                      onClick={() => {
                        if (panelOpen) {
                          setPanelOpen(false);
                          setIssueId(null);
                        } else if (cursorId) {
                          openIssue(cursorId, true, true);
                        } else if (visible[0]) {
                          openIssue(visible[0].id, true, true);
                        } else {
                          flash("Select an issue first");
                        }
                      }}
                    >
                      <PanelIcon />
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="board-body">
                {nav === "inbox" ? (
                  <InboxList
                    items={inbox}
                    issues={issues}
                    onOpen={openIssue}
                    onRead={(id) => setInbox((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)))}
                  />
                ) : nav === "reviews" ? (
                  <ReviewList
                    reviews={reviews}
                    onApprove={(id) => {
                      setReviews((current) => current.map((item) => (item.id === id ? { ...item, approved: true } : item)));
                      flash("Approved");
                    }}
                  />
                ) : nav === "agent" ? (
                  <AgentPane
                    messages={agentMessages}
                    draft={agentDraft}
                    onDraft={setAgentDraft}
                    onSend={sendAgent}
                  />
                ) : nav === "projects" && !activeProject ? (
                  <ProjectList
                    projects={projects}
                    progressOf={(id) => kernel.projectProgress(id)}
                    healthOf={(id) => kernel.projectHealth(id)}
                    onOpen={openProject}
                  />
                ) : nav === "projects" && activeProject ? (
                  <ProjectPage
                    project={activeProject}
                    issues={kernel.projectIssues(activeProject.id)}
                    milestones={milestones}
                    initiatives={initiatives}
                    activity={activity.filter((item) => kernel.projectIssues(activeProject.id).some((issue) => issue.id === item.issueId))}
                    tab={projectTab}
                    progress={kernel.projectProgress(activeProject.id)}
                    health={kernel.projectHealth(activeProject.id)}
                    milestoneProgress={(id) => kernel.milestoneProgress(id)}
                    onTab={(next) => go({ nav: "projects", projectId: activeProject.id, projectTab: next })}
                    onOpenIssue={openIssue}
                    onCycleStatus={() =>
                      patchProject(activeProject.id, { status: nextProjectStatus(activeProject.status) })
                    }
                    onCyclePriority={() =>
                      patchProject(activeProject.id, {
                        priority: (((activeProject.priority + 1) % 5) as Priority),
                      })
                    }
                  />
                ) : nav === "views" && !activeView ? (
                  <ViewList views={views} issueCount={(id) => kernel.customViewIssues(id).length} onOpen={openView} />
                ) : nav === "loops" || nav === "team-home" ? (
                  <EmptyState text={`${pageTitle} is a visual shell in this replica`} onCreate={() => openComposer()} />
                ) : tab === "activity" && nav === "my-issues" ? (
                  <ActivityList
                    activity={activity}
                    issues={issues}
                    onOpen={openIssue}
                  />
                ) : selected && !panelOpen ? (
                  <IssuePage
                    issue={selected}
                    projectName={projects.find((project) => project.id === selected.projectId)?.name}
                    milestoneName={milestones.find((item) => item.id === selected.milestoneId)?.name}
                    activity={activity.filter((item) => item.issueId === selected.id)}
                    comment={comment}
                    onComment={setComment}
                    onSubmitComment={() => addComment(selected.id)}
                    onCycle={() => cycleStatus(selected.id)}
                    onPriority={() => cyclePriority(selected.id)}
                    onProject={() => cycleProject(selected.id)}
                    onMilestone={() => cycleMilestone(selected.id)}
                    onTitle={(title) => patchIssue(selected.id, { title })}
                  />
                ) : visible.length === 0 ? (
                  nav === "views" &&
                  activeView &&
                  kernel.customViewIssues(activeView.id).length === 0 ? (
                    <ViewFilterEmptyState
                      explanation={explainViewFilter(activeView.filter, kernel.viewer, projects)}
                    />
                  ) : (
                    <EmptyState text={EMPTY[tab]} onCreate={() => openComposer()} />
                  )
                ) : (
                  <IssueList
                    groups={grouped}
                    layout={activeView?.layout ?? "list"}
                    cursorId={cursorId}
                    issueId={issueId}
                    checkedIds={checkedIds}
                    showPriority={showPriority}
                    listStatusOpen={listStatusOpen}
                    onHover={(id) => setCursorId(id)}
                    onOpen={(id) => openIssue(id)}
                    onSelect={(id) => {
                      setCursorId(id);
                      toggleChecked(id);
                    }}
                    onStatus={(id) => {
                      setCursorId(id);
                      setListStatusOpen(true);
                    }}
                    onPickStatus={(id, status) => {
                      patchIssue(id, { status }, `Status changed to ${STATUS_LABEL[status]}`);
                      setListStatusOpen(false);
                    }}
                    onCreateIn={(status) => openComposer(status ?? "backlog")}
                  />
                )}
              </div>
            </div>

            {panelOpen && selected && (nav === "my-issues" || nav === "team-issues") ? (
              <IssuePanel
                issue={selected}
                projectName={projects.find((project) => project.id === selected.projectId)?.name}
                milestoneName={milestones.find((item) => item.id === selected.milestoneId)?.name}
                activity={activity.filter((item) => item.issueId === selected.id)}
                comment={comment}
                onComment={setComment}
                onSubmitComment={() => addComment(selected.id)}
                onClose={() => {
                  setPanelOpen(false);
                  setIssueId(null);
                }}
                onCycle={() => cycleStatus(selected.id)}
                onPriority={() =>
                  patchIssue(
                    selected.id,
                    { priority: ((selected.priority + 1) % 5) as Priority },
                    "Priority updated",
                  )
                }
                onProject={() => cycleProject(selected.id)}
                onMilestone={() => cycleMilestone(selected.id)}
                onSubscribe={() =>
                  patchIssue(
                    selected.id,
                    { subscribed: !selected.subscribed },
                    selected.subscribed ? "Unsubscribed" : "Subscribed",
                  )
                }
                onTitle={(title) => patchIssue(selected.id, { title })}
              />
            ) : null}

            {nav !== "agent" && !(panelOpen && selected) && !activeProject ? (
              <div className="agent-bar">
                <button className="agent-btn" type="button" onClick={() => go({ nav: "agent" })}>
                  <AgentIcon />
                  Agent
                </button>
                <button className="tb-icon" type="button" aria-label="Recent" onClick={() => go({ nav: "agent" })}>
                  <HistoryIcon />
                </button>
              </div>
            ) : null}

            {composerOpen ? (
              <div
                className="scrim"
                onClick={() => {
                  setStatusMenuOpen(false);
                  setComposerOpen(false);
                }}
              >
                <form
                  className="composer"
                  onClick={(event) => event.stopPropagation()}
                  onSubmit={(event) => {
                    event.preventDefault();
                    createIssue();
                  }}
                >
                  <div className="composer-crumb">
                    <span className="avatar">{workspace.slice(0, 2).toUpperCase()}</span>
                    <span>{workspace}</span>
                    <span aria-hidden="true">›</span>
                    {draftProjectId ? (
                      <>
                        <CubeIcon />
                        <span>{projects.find((project) => project.id === draftProjectId)?.name ?? "Project"}</span>
                        <span aria-hidden="true">›</span>
                      </>
                    ) : null}
                    <strong>New issue</strong>
                    <div className="composer-actions">
                      {draftTitle.trim() || draftBody.trim() ? (
                        <button
                          className="composer-ghost"
                          type="button"
                          onClick={() => {
                            flash("Saved as draft");
                            setComposerOpen(false);
                          }}
                        >
                          Save as draft
                        </button>
                      ) : null}
                      <button
                        className="composer-ghost"
                        type="button"
                        aria-label="Share"
                        onClick={() => flash("Share")}
                      >
                        <ShareIcon />
                      </button>
                      <button
                        className="composer-ghost"
                        type="button"
                        aria-label="Close"
                        onClick={() => setComposerOpen(false)}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  </div>
                  <input
                    ref={titleRef}
                    className="composer-title"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
                        event.preventDefault();
                        bodyRef.current?.focus();
                      }
                    }}
                    placeholder="Issue title"
                    autoFocus
                  />
                  <textarea
                    ref={bodyRef}
                    className="composer-body"
                    value={draftBody}
                    onChange={(event) => setDraftBody(event.target.value)}
                    placeholder="Add description…"
                  />
                  <div className="composer-props">
                    <div className="prop-chip-wrap">
                      <button
                        className={statusMenuOpen ? "prop-chip open" : "prop-chip"}
                        type="button"
                        onClick={() => setStatusMenuOpen((open) => !open)}
                      >
                        <StatusIcon status={draftStatus} />
                        {STATUS_LABEL[draftStatus]}
                      </button>
                      {statusMenuOpen ? (
                        <div className="status-menu">
                          <div className="status-menu-head">
                            Change status…
                            <kbd>S</kbd>
                          </div>
                          {STATUSES.map((status, index) => (
                            <button
                              key={status}
                              className={status === draftStatus ? "status-option active" : "status-option"}
                              type="button"
                              onClick={() => {
                                setDraftStatus(status);
                                setStatusMenuOpen(false);
                              }}
                            >
                              <StatusIcon status={status} />
                              {STATUS_LABEL[status]}
                              <span className="status-check">{status === draftStatus ? <CheckTinyIcon /> : null}</span>
                              <span className="push">{index + 1}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button className="prop-chip" type="button" onClick={() => flash("Priority")}>
                      <PriorityIcon level={0} />
                      Priority
                    </button>
                    <button className="prop-chip" type="button" onClick={() => flash("Assignee")}>
                      <PersonIcon />
                      Assignee
                    </button>
                    <button
                      className="prop-chip"
                      type="button"
                      onClick={() => {
                        const next = projects[0]?.id ?? null;
                        setDraftProjectId((current) => (current ? null : next));
                      }}
                    >
                      <CubeIcon />
                      {draftProjectId
                        ? projects.find((project) => project.id === draftProjectId)?.name ?? "Project"
                        : "Project"}
                    </button>
                    <button className="prop-chip" type="button" onClick={() => flash("Labels")}>
                      <LabelIcon />
                      {draftLabels[0] ?? "Labels"}
                    </button>
                    <button className="prop-chip" type="button" aria-label="More">
                      <MoreIcon />
                    </button>
                  </div>
                  <div className="composer-footer">
                    <button className="template-btn" type="button" aria-label="Templates" onClick={() => flash("Templates")}>
                      <SparkIcon />
                    </button>
                    <button
                      className="create-more"
                      type="button"
                      onClick={() => setCreateMore((value) => !value)}
                    >
                      <span className={createMore ? "create-more-switch on" : "create-more-switch"}>
                        <span />
                      </span>
                      Create more
                    </button>
                    <button className="primary" type="submit">
                      Create issue
                    </button>
                  </div>
                </form>
              </div>
            ) : null}
          </section>
        </main>
      </div>

      {commandOpen ? (
        <div className="cmdk-layer" onClick={() => setCommandOpen(false)}>
          <div className="cmdk" onClick={(event) => event.stopPropagation()}>
            {selectedIssue ? (
              <div className="cmdk-context">
                <StatusIcon status={selectedIssue.status} />
                {selectedIssue.id} · {selectedIssue.title}
              </div>
            ) : null}
            <div className="cmdk-search">
              <input
                ref={commandRef}
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="Type a command or search…"
              />
              <span className="cmdk-ask">Ask Linear <kbd>Tab</kbd></span>
            </div>
            <div className="cmdk-list">
              {commands.length === 0 ? (
                <div className="cmdk-empty">
                  <p className="cmdk-quick">Quick results for “{commandQuery}”</p>
                  <div className="cmdk-empty-row">
                    <SearchIcon />
                    No results found
                    <button type="button" className="text-link" onClick={() => flash("Advanced search")}>
                      Go to advanced search
                    </button>
                  </div>
                </div>
              ) : (
                commands.map((item, index) => {
                  const prev = commands[index - 1];
                  return (
                    <div key={item.id}>
                      {item.group !== prev?.group ? <p className="cmdk-group">{item.group}</p> : null}
                      <button
                        type="button"
                        className={index === commandIndex ? "cmdk-item active" : "cmdk-item"}
                        onMouseEnter={() => setCommandIndex(index)}
                        onClick={() => {
                          item.run();
                          setCommandOpen(false);
                        }}
                      >
                        <span>{item.title}</span>
                        <kbd>{item.hint}</kbd>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {shortcutsOpen ? (
        <div className="shortcuts-layer" onClick={() => setShortcutsOpen(false)}>
          <aside className="shortcuts-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="shortcuts-head">
              <h2>Keyboard Shortcuts</h2>
              <button className="composer-ghost" type="button" aria-label="Close shortcuts" onClick={() => setShortcutsOpen(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="shortcuts-search">
              <SearchIcon />
              <input
                ref={shortcutRef}
                value={shortcutQuery}
                onChange={(event) => setShortcutQuery(event.target.value)}
                placeholder="Search shortcuts"
              />
            </div>
            <div className="shortcuts-body">
              {SHORTCUT_GROUPS.map((group) => {
                const items = group.items.filter((item) => {
                  const q = shortcutQuery.trim().toLowerCase();
                  return !q || item.label.toLowerCase().includes(q) || item.keys.toLowerCase().includes(q);
                });
                if (!items.length) return null;
                return (
                  <section key={group.group}>
                    <h3>{group.group}</h3>
                    {items.map((item) => (
                      <div className="shortcut-row" key={item.label}>
                        <span>{item.label}</span>
                        <kbd>{item.keys}</kbd>
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>
          </aside>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function NavButton({
  id,
  section,
  current,
  projectsViewsSection,
  onSelect,
  icon,
  label,
  trailing,
  indent,
}: {
  id: NavId;
  section: SidebarNavSection;
  current: NavId;
  projectsViewsSection: ProjectsViewsSection;
  onSelect: (id: NavId) => void;
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  indent?: boolean;
}) {
  const active = isSidebarNavActive(id, section, current, projectsViewsSection);
  return (
    <button
      type="button"
      className={`${active ? "nav-item active" : "nav-item"}${indent ? " indent" : ""}`}
      onClick={() => onSelect(id)}
    >
      {icon}
      <span className="label">{label}</span>
      {trailing}
    </button>
  );
}

function EmptyState({ text, onCreate }: { text: string; onCreate: () => void }) {
  return (
    <div className="empty">
      <EmptyMark />
      <p>{text}</p>
      <button className="primary pill" type="button" onClick={onCreate}>
        Create new issue
      </button>
    </div>
  );
}

function ViewFilterEmptyState({ explanation }: { explanation: ViewFilterExplanation }) {
  return (
    <div className="empty">
      <EmptyMark />
      <p>{explanation.title}</p>
      {explanation.subline ? <p className="empty-subline">{explanation.subline}</p> : null}
      {explanation.lines.length > 0 ? (
        <ul className="empty-lines">
          {explanation.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="shortcut">
      <span>{label}</span>
      <kbd>{keys}</kbd>
    </div>
  );
}

function InboxList({
  items,
  issues,
  onOpen,
  onRead,
}: {
  items: InboxItem[];
  issues: Issue[];
  onOpen: (id: string) => void;
  onRead: (id: string) => void;
}) {
  if (!items.length) return <EmptyState text="Inbox is empty" onCreate={() => onOpen(issues[0]?.id ?? "")} />;
  return (
    <ul className="feed">
      {items.map((item) => {
        const issue = issues.find((entry) => entry.id === item.issueId);
        return (
          <li key={item.id}>
            <button
              type="button"
              className={item.read ? "feed-item" : "feed-item unread"}
              onClick={() => {
                onRead(item.id);
                onOpen(item.issueId);
              }}
            >
              <BellIcon />
              <span className="feed-body">
                <strong>{issue?.id ?? item.issueId}</strong> {item.text}
              </span>
              <span className="issue-date">{item.time}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ActivityList({
  activity,
  issues,
  onOpen,
}: {
  activity: Activity[];
  issues: Issue[];
  onOpen: (id: string) => void;
}) {
  if (!activity.length) return <p className="empty-inline">No activity yet</p>;
  return (
    <ul className="feed">
      {activity.map((item) => {
        const issue = issues.find((entry) => entry.id === item.issueId);
        return (
          <li key={item.id}>
            <button type="button" className="feed-item" onClick={() => onOpen(item.issueId)}>
              <StatusIcon status={issue?.status ?? "todo"} />
              <span className="feed-body">
                <strong>{issue?.id ?? item.issueId}</strong> {item.text}
              </span>
              <span className="issue-date">{item.time}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ReviewList({ reviews, onApprove }: { reviews: Review[]; onApprove: (id: string) => void }) {
  return (
    <ul className="feed">
      {reviews.map((review) => (
        <li key={review.id} className="review">
          <div>
            <p className="issue-title">{review.title}</p>
            <p className="issue-date">{review.author}</p>
          </div>
          {review.approved ? (
            <span className="chip">Approved</span>
          ) : (
            <button className="primary" type="button" onClick={() => onApprove(review.id)}>
              Approve
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function AgentPane({
  messages,
  draft,
  onDraft,
  onSend,
}: {
  messages: string[];
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="agent-pane">
      <div className="agent-log">
        {messages.map((message, index) => (
          <p key={`${message}-${index}`}>{message}</p>
        ))}
      </div>
      <form
        className="agent-input"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <input value={draft} onChange={(event) => onDraft(event.target.value)} placeholder="Ask Agent…" />
        <button className="primary" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}

function IssuePanel({
  issue,
  projectName,
  milestoneName,
  activity,
  comment,
  onComment,
  onSubmitComment,
  onClose,
  onCycle,
  onPriority,
  onProject,
  onMilestone,
  onSubscribe,
  onTitle,
}: {
  issue: Issue;
  projectName?: string;
  milestoneName?: string;
  activity: Activity[];
  comment: string;
  onComment: (value: string) => void;
  onSubmitComment: () => void;
  onClose: () => void;
  onCycle: () => void;
  onPriority: () => void;
  onProject: () => void;
  onMilestone: () => void;
  onSubscribe: () => void;
  onTitle: (value: string) => void;
}) {
  return (
    <aside className="panel">
      <div className="panel-top">
        <span className="issue-id">{issue.id}</span>
        <button className="tb-icon" type="button" aria-label="Close details" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <input
        className="panel-title"
        value={issue.title}
        onChange={(event) => onTitle(event.target.value)}
      />
      <p className="panel-body">{issue.body || "No description"}</p>
      <div className="panel-meta">
        <button className="meta-btn" type="button" onClick={onCycle}>
          <StatusIcon status={issue.status} />
          {STATUS_LABEL[issue.status]}
        </button>
        <button className="meta-btn" type="button" onClick={onPriority}>
          <PriorityIcon level={issue.priority} />
          Priority {issue.priority || "none"}
        </button>
        <button className="meta-btn" type="button" onClick={onSubscribe}>
          <BellIcon />
          {issue.subscribed ? "Subscribed" : "Subscribe"}
        </button>
        <button className="meta-btn" type="button" onClick={onProject}>
          <CubeIcon />
          {projectName ?? "Add to project"}
        </button>
        <button className="meta-btn" type="button" onClick={onMilestone}>
          <CalendarIcon />
          {milestoneName ?? "Add milestone"}
        </button>
      </div>
      <div className="panel-activity">
        {activity.map((item) => (
          <p key={item.id}>
            {item.text} <span className="issue-date">{item.time}</span>
          </p>
        ))}
      </div>
      <form
        className="panel-comment"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitComment();
        }}
      >
        <input value={comment} onChange={(event) => onComment(event.target.value)} placeholder="Leave a comment…" />
      </form>
    </aside>
  );
}

function IssueList({
  groups,
  layout = "list",
  cursorId,
  issueId,
  checkedIds,
  showPriority,
  listStatusOpen,
  onHover,
  onOpen,
  onSelect,
  onStatus,
  onPickStatus,
  onCreateIn,
}: {
  groups: IssueGroup[];
  layout?: ViewLayout;
  cursorId: string | null;
  issueId: string | null;
  checkedIds: string[];
  showPriority: boolean;
  listStatusOpen: boolean;
  onHover: (id: string) => void;
  onOpen: (id: string) => void;
  onSelect: (id: string) => void;
  onStatus: (id: string) => void;
  onPickStatus: (id: string, status: IssueStatus) => void;
  onCreateIn: (status?: IssueStatus) => void;
}) {
  return (
    <ul className={layout === "board" ? "issue-list board-layout" : "issue-list"}>
      {groups.map((group) => (
        <li key={group.key} className="issue-group">
          <div className="group-head">
            {group.status ? <StatusIcon status={group.status} /> : <ViewsIcon />}
            <span>{group.label}</span>
            <span className="count">{group.items.length}</span>
            <button className="tb-icon" type="button" aria-label={`Create in ${group.label}`} onClick={() => onCreateIn(group.status)}>
              <PlusIcon />
            </button>
          </div>
          {group.items.map((issue) => {
            const active = issue.id === cursorId || issue.id === issueId;
            return (
              <div
                key={issue.id}
                className={active ? "issue selected" : "issue"}
                role="button"
                tabIndex={0}
                onMouseEnter={() => onHover(issue.id)}
                onClick={() => onOpen(issue.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onOpen(issue.id);
                }}
              >
                <button
                  type="button"
                  className={checkedIds.includes(issue.id) ? "issue-check on" : "issue-check"}
                  aria-label="Select issue"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(issue.id);
                  }}
                >
                  {checkedIds.includes(issue.id) ? <CheckTinyIcon /> : null}
                </button>
                <span className="issue-grip"><GripIcon /></span>
                <span className="issue-id">{issue.id}</span>
                <button
                  type="button"
                  className="status-hit"
                  aria-label="Change status"
                  onClick={(event) => {
                    event.stopPropagation();
                    onStatus(issue.id);
                  }}
                >
                  <StatusIcon status={issue.status} />
                </button>
                {showPriority ? <PriorityIcon level={issue.priority} /> : <span />}
                <span className="issue-title">{issue.title}</span>
                {issue.labels[0] ? <span className="chip">{issue.labels[0]}</span> : <span />}
                {issue.assignee ? <span className="row-avatar">{issue.assignee.slice(0, 1)}</span> : <span />}
                <span className="issue-date">{issue.date}</span>
                {listStatusOpen && issue.id === cursorId ? (
                  <div className="status-menu list-status-menu" onClick={(event) => event.stopPropagation()}>
                    <div className="status-menu-issue">
                      {issue.id} · {issue.title}
                    </div>
                    <div className="status-menu-head">Change status…</div>
                    {STATUSES.map((status, index) => (
                      <button
                        key={status}
                        className={status === issue.status ? "status-option active" : "status-option"}
                        type="button"
                        onClick={() => onPickStatus(issue.id, status)}
                      >
                        <StatusIcon status={status} />
                        {STATUS_LABEL[status]}
                        <span className="status-check">{status === issue.status ? <CheckTinyIcon /> : null}</span>
                        <span className="push">{index + 1}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </li>
      ))}
    </ul>
  );
}

function IssuePage({
  issue,
  projectName,
  milestoneName,
  activity,
  comment,
  onComment,
  onSubmitComment,
  onCycle,
  onPriority,
  onProject,
  onMilestone,
  onTitle,
}: {
  issue: Issue;
  projectName?: string;
  milestoneName?: string;
  activity: Activity[];
  comment: string;
  onComment: (value: string) => void;
  onSubmitComment: () => void;
  onCycle: () => void;
  onPriority: () => void;
  onProject: () => void;
  onMilestone: () => void;
  onTitle: (value: string) => void;
}) {
  return (
    <div className="issue-page">
      <div className="issue-page-main">
        <input className="panel-title page-title" value={issue.title} onChange={(event) => onTitle(event.target.value)} />
        <p className="panel-body">{issue.body || "No description"}</p>
        <div className="panel-activity">
          {activity.map((item) => (
            <p key={item.id}>
              {item.text} <span className="issue-date">{item.time}</span>
            </p>
          ))}
        </div>
        <form
          className="panel-comment"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitComment();
          }}
        >
          <input value={comment} onChange={(event) => onComment(event.target.value)} placeholder="Leave a comment…" />
        </form>
      </div>
      <aside className="issue-props">
        <p className="props-label">Properties</p>
        <button className="meta-btn" type="button" onClick={onCycle}>
          <StatusIcon status={issue.status} />
          {STATUS_LABEL[issue.status]}
        </button>
        <button className="meta-btn" type="button" onClick={onPriority}>
          <PriorityIcon level={issue.priority} />
          {issue.priority ? `Priority ${issue.priority}` : "Set priority"}
        </button>
        <button className="meta-btn" type="button">
          <PersonIcon />
          {issue.assignee ?? "Assign"}
        </button>
        <button className="meta-btn" type="button" onClick={onProject}>
          <CubeIcon />
          {projectName ?? "Add to project"}
        </button>
        <button className="meta-btn" type="button" onClick={onMilestone}>
          <CalendarIcon />
          {milestoneName ?? "Add milestone"}
        </button>
        <p className="props-label">Labels</p>
        <button className="meta-btn" type="button">
          <LabelIcon />
          {issue.labels[0] ?? "Add label"}
        </button>
      </aside>
    </div>
  );
}

function labelForNav(id: NavId) {
  switch (id) {
    case "inbox":
      return "Inbox";
    case "reviews":
      return "Reviews";
    case "agent":
      return "Agent";
    case "projects":
      return "Projects";
    case "views":
      return "Views";
    case "loops":
      return "Loops";
    case "team-home":
      return "Home";
    case "team-issues":
      return "Issues";
    default:
      return "My issues";
  }
}

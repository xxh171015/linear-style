import { ISSUE_STATUSES, PROJECT_STATUSES } from "./kernel";
import type {
  Frame,
  IssueStatus,
  IssueTab,
  NavId,
  ProjectStatus,
  ProjectTab,
} from "./types";

export { ISSUE_GROUPINGS, ISSUE_STATUSES as STATUSES, PRIORITY_LABEL, STATUS_LABEL } from "./kernel";

/** Linear WorkflowState.type mapping used by grouping and progress. */
export const WORKFLOW_TYPE: Record<IssueStatus, "backlog" | "unstarted" | "started" | "completed" | "canceled"> = {
  backlog: "backlog",
  todo: "unstarted",
  progress: "started",
  done: "completed",
  canceled: "canceled",
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  backlog: "Backlog",
  planned: "Planned",
  started: "In Progress",
  paused: "Paused",
  completed: "Completed",
  canceled: "Canceled",
};

export const HEALTH_LABEL = {
  onTrack: "On track",
  atRisk: "At risk",
  offTrack: "Off track",
} as const;

export function nextStatus(status: IssueStatus): IssueStatus {
  return ISSUE_STATUSES[(ISSUE_STATUSES.indexOf(status) + 1) % ISSUE_STATUSES.length];
}

export function nextProjectStatus(status: ProjectStatus): ProjectStatus {
  return PROJECT_STATUSES[(PROJECT_STATUSES.indexOf(status) + 1) % PROJECT_STATUSES.length];
}

export function emptyFrame(): Pick<Frame, "projectId" | "viewId" | "projectTab" | "issueId"> {
  return { projectId: null, viewId: null, projectTab: "overview", issueId: null };
}

const ISSUE_TABS: IssueTab[] = ["assigned", "created", "subscribed", "activity"];
const PROJECT_TABS: ProjectTab[] = ["overview", "activity", "issues"];
const NAVS: NavId[] = [
  "inbox",
  "my-issues",
  "reviews",
  "agent",
  "projects",
  "views",
  "loops",
  "team-home",
  "team-issues",
];

export function parseHash(hash = typeof window === "undefined" ? "" : window.location.hash): Frame & {
  composer: boolean;
  command: boolean;
} {
  const parts = hash.replace(/^#/, "").replace(/^\//, "").split("/").filter(Boolean);
  const frame: Frame = { nav: "my-issues", tab: "assigned", ...emptyFrame() };
  const extras = { composer: false, command: false };

  if (!parts.length) return { ...frame, ...extras };
  if (parts[0] === "composer") return { ...frame, composer: true, command: false };
  if (parts[0] === "command") return { ...frame, composer: false, command: true };
  if (ISSUE_TABS.includes(parts[0] as IssueTab) && parts.length === 1) {
    return { ...frame, tab: parts[0] as IssueTab, ...extras };
  }
  if (parts[0].startsWith("issue-")) {
    return { ...frame, issueId: parts[0].slice(6), ...extras };
  }
  if (parts[0] === "issue" && parts[1]) {
    return { ...frame, issueId: decodeURIComponent(parts[1]), ...extras };
  }
  if (parts[0] === "project" && parts[1]) {
    const projectTab = PROJECT_TABS.includes(parts[2] as ProjectTab) ? (parts[2] as ProjectTab) : "overview";
    return {
      ...frame,
      nav: "projects",
      projectId: decodeURIComponent(parts[1]),
      projectTab,
      ...extras,
    };
  }
  if (parts[0] === "view" && parts[1]) {
    return { ...frame, nav: "views", viewId: decodeURIComponent(parts[1]), ...extras };
  }
  if (parts[0] === "my-issues") {
    const tab = ISSUE_TABS.includes(parts[1] as IssueTab) ? (parts[1] as IssueTab) : "assigned";
    return { ...frame, nav: "my-issues", tab, ...extras };
  }
  if (NAVS.includes(parts[0] as NavId)) {
    return { ...frame, nav: parts[0] as NavId, ...extras };
  }
  return { ...frame, ...extras };
}

export function hashFor(frame: Frame, extras?: { composer?: boolean; command?: boolean }): string {
  if (extras?.composer) return "#/composer";
  if (extras?.command) return "#/command";
  if (frame.issueId) return `#/issue/${encodeURIComponent(frame.issueId)}`;
  if (frame.nav === "projects" && frame.projectId) {
    return frame.projectTab !== "overview"
      ? `#/project/${encodeURIComponent(frame.projectId)}/${frame.projectTab}`
      : `#/project/${encodeURIComponent(frame.projectId)}`;
  }
  if (frame.nav === "views" && frame.viewId) {
    return `#/view/${encodeURIComponent(frame.viewId)}`;
  }
  if (frame.nav === "my-issues") {
    return frame.tab === "assigned" ? "#/my-issues" : `#/my-issues/${frame.tab}`;
  }
  return `#/${frame.nav}`;
}

export function toFrame(partial: Partial<Frame> & { nav: NavId }, fallbackTab: IssueTab = "assigned"): Frame {
  return {
    nav: partial.nav,
    tab: partial.tab ?? fallbackTab,
    issueId: partial.issueId ?? null,
    projectId: partial.projectId ?? null,
    viewId: partial.viewId ?? null,
    projectTab: partial.projectTab ?? "overview",
  };
}

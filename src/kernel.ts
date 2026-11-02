import type {
  CustomView,
  Issue,
  IssueGroup,
  IssueGrouping,
  IssueStatus,
  Priority,
  Project,
  ProjectStatus,
} from "./types";

export const ISSUE_STATUSES: IssueStatus[] = ["backlog", "todo", "progress", "done", "canceled"];

export const ISSUE_GROUPINGS: IssueGrouping[] = ["status", "priority", "assignee", "project", "none"];

export const PROJECT_STATUSES: ProjectStatus[] = [
  "backlog",
  "planned",
  "started",
  "paused",
  "completed",
  "canceled",
];

export const STATUS_LABEL: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  progress: "In Progress",
  done: "Done",
  canceled: "Canceled",
};

export const PRIORITY_LABEL = ["No priority", "Urgent", "High", "Medium", "Low"] as const;

export type CreateIssueInput = {
  title: string;
  body?: string;
  status?: IssueStatus;
  assignee?: string | null;
  creator?: string;
  subscribed?: boolean;
  estimate?: number;
  parentId?: string;
  labels?: string[];
  priority?: Priority;
  projectId?: string;
  milestoneId?: string;
  date?: string;
};

export type IssuePatch = {
  title?: string;
  body?: string;
  status?: IssueStatus;
  assignee?: string | null;
  subscribed?: boolean;
  estimate?: number | null;
  parentId?: string | null;
  labels?: string[];
  priority?: Priority;
};

export type UpdateIssueResult =
  | { ok: true; issue: Issue }
  | { ok: false; error: "unknown-issue" | "self-parent" | "unknown-parent" };

export type KernelSeed = {
  viewer?: string;
  teamKey?: string;
  issues?: Issue[];
  projects?: Project[];
  views?: CustomView[];
};

export type ProductKernel = {
  readonly viewer: string;
  readonly teamKey: string;
  issues(): Issue[];
  views(): CustomView[];
  projects(): Project[];
  getIssue(id: string): Issue | undefined;
  teamIssues(): Issue[];
  myIssuesAssigned(): Issue[];
  myIssuesCreated(): Issue[];
  myIssuesSubscribed(): Issue[];
  groupIssues(issues: Issue[], grouping: IssueGrouping): IssueGroup[];
  createIssue(input: CreateIssueInput): Issue;
  updateIssue(id: string, patch: IssuePatch): UpdateIssueResult;
};

export function createKernel(seed: KernelSeed = {}): ProductKernel {
  const viewer = seed.viewer ?? "";
  const teamKey = seed.teamKey ?? "XXH";
  let issues = (seed.issues ?? []).map(copyIssue);
  const projects = (seed.projects ?? []).map(copyProject);
  const views = (seed.views ?? []).map(copyView);

  function teamIssues(): Issue[] {
    return issues.filter((item) => item.teamKey === teamKey);
  }

  return {
    viewer,
    teamKey,
    issues: () => issues.slice(),
    views: () => views.slice(),
    projects: () => projects.slice(),
    getIssue: (id) => issues.find((item) => item.id === id),
    teamIssues,
    myIssuesAssigned: () => teamIssues().filter((item) => item.assignee === viewer),
    myIssuesCreated: () => teamIssues().filter((item) => item.creator === viewer),
    myIssuesSubscribed: () => teamIssues().filter((item) => item.subscribed),
    groupIssues: (items, grouping) => groupIssueList(items, grouping, projects),
    createIssue(input) {
      const id = nextIdentifier(issues, teamKey);
      const created: Issue = {
        id,
        title: input.title.trim(),
        body: input.body ?? "",
        status: input.status ?? "backlog",
        date: input.date ?? "",
        labels: input.labels ? [...input.labels] : [],
        priority: input.priority ?? 0,
        subscribed: input.subscribed ?? false,
        teamKey,
      };
      if (input.assignee) created.assignee = input.assignee;
      created.creator = input.creator ?? viewer;
      if (input.estimate !== undefined) created.estimate = input.estimate;
      if (input.parentId && input.parentId !== id && issues.some((item) => item.id === input.parentId)) {
        created.parentId = input.parentId;
      }
      if (input.projectId) created.projectId = input.projectId;
      if (input.milestoneId) created.milestoneId = input.milestoneId;
      issues = [created, ...issues];
      return created;
    },
    updateIssue(id, patch) {
      const current = issues.find((item) => item.id === id);
      if (!current) return { ok: false, error: "unknown-issue" };
      if (patch.parentId === id) return { ok: false, error: "self-parent" };
      if (patch.parentId && !issues.some((item) => item.id === patch.parentId)) {
        return { ok: false, error: "unknown-parent" };
      }
      applyIssuePatch(current, patch);
      issues = issues.slice();
      return { ok: true, issue: current };
    },
  };
}

function groupIssueList(issues: Issue[], grouping: IssueGrouping, projects: Project[]): IssueGroup[] {
  if (grouping === "none") {
    return issues.length ? [{ key: "all", label: "Issues", items: issues }] : [];
  }
  if (grouping === "status") {
    return ISSUE_STATUSES.map((status) => ({
      key: status,
      label: STATUS_LABEL[status],
      status,
      items: issues.filter((item) => item.status === status),
    })).filter((group) => group.items.length > 0);
  }
  if (grouping === "priority") {
    return ([1, 2, 3, 4, 0] as const)
      .map((priority) => ({
        key: `p${priority}`,
        label: PRIORITY_LABEL[priority],
        items: issues.filter((item) => item.priority === priority),
      }))
      .filter((group) => group.items.length > 0);
  }
  if (grouping === "assignee") {
    const names = [...new Set(issues.map((item) => item.assignee ?? "No assignee"))];
    return names.map((name) => ({
      key: name,
      label: name,
      items: issues.filter((item) => (item.assignee ?? "No assignee") === name),
    }));
  }
  const ids = [...new Set(issues.map((item) => item.projectId ?? "none"))];
  return ids.map((id) => ({
    key: id,
    label: id === "none" ? "No project" : (projects.find((item) => item.id === id)?.name ?? id),
    items: issues.filter((item) => (item.projectId ?? "none") === id),
  }));
}

function nextIdentifier(issues: Issue[], teamKey: string): string {
  const prefix = `${teamKey}-`;
  let max = 0;
  for (const item of issues) {
    if (!item.id.startsWith(prefix)) continue;
    const n = Number(item.id.slice(prefix.length));
    if (Number.isInteger(n)) max = Math.max(max, n);
  }
  return `${prefix}${max + 1}`;
}

function applyIssuePatch(issue: Issue, patch: IssuePatch): void {
  if (patch.title !== undefined) issue.title = patch.title;
  if (patch.body !== undefined) issue.body = patch.body;
  if (patch.status !== undefined) issue.status = patch.status;
  if (patch.subscribed !== undefined) issue.subscribed = patch.subscribed;
  if (patch.labels !== undefined) issue.labels = [...patch.labels];
  if (patch.priority !== undefined) issue.priority = patch.priority;
  if (patch.assignee !== undefined) {
    if (patch.assignee === null) delete issue.assignee;
    else issue.assignee = patch.assignee;
  }
  if (patch.estimate !== undefined) {
    if (patch.estimate === null) delete issue.estimate;
    else issue.estimate = patch.estimate;
  }
  if (patch.parentId !== undefined) {
    if (patch.parentId === null) delete issue.parentId;
    else issue.parentId = patch.parentId;
  }
}

function copyIssue(issue: Issue): Issue {
  return { ...issue, labels: [...issue.labels] };
}

function copyProject(project: Project): Project {
  return {
    ...project,
    memberIds: [...project.memberIds],
    teamKeys: [...project.teamKeys],
    initiativeIds: [...project.initiativeIds],
    labels: [...project.labels],
    weekProgress: [...project.weekProgress],
    nextFocus: [...project.nextFocus],
    resources: project.resources.map((item) => ({ ...item })),
    updates: project.updates.map((item) => ({ ...item })),
  };
}

function copyView(view: CustomView): CustomView {
  return {
    ...view,
    filter: {
      ...view.filter,
      statuses: view.filter.statuses ? [...view.filter.statuses] : undefined,
      labels: view.filter.labels ? [...view.filter.labels] : undefined,
    },
  };
}

import type {
  CustomView,
  Issue,
  IssueGroup,
  IssueGrouping,
  IssueStatus,
  Priority,
  Project,
  ProjectHealth,
  ProjectMilestone,
  ProjectStatus,
  ProjectUpdate,
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
  projectId?: string | null;
  labels?: string[];
  priority?: Priority;
};

export type CreateProjectInput = {
  name: string;
  description?: string;
  slugId?: string;
  lead?: string;
  startDate?: string;
  targetDate?: string;
};

export type ProjectPatch = {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: Priority;
  lead?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
};

export type UpdateIssueResult =
  | { ok: true; issue: Issue }
  | { ok: false; error: "unknown-issue" | "self-parent" | "unknown-parent" | "unknown-project" };

export type Progress = {
  scope: number;
  started: number;
  completed: number;
  ratio: number;
};

export type CreateProjectUpdateInput = {
  health: ProjectHealth;
  body: string;
  author?: string;
  time?: string;
};

export type KernelSeed = {
  viewer?: string;
  teamKey?: string;
  issues?: Issue[];
  projects?: Project[];
  views?: CustomView[];
  milestones?: ProjectMilestone[];
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
  projectIssues(projectId: string): Issue[];
  getProject(id: string): Project | undefined;
  createProject(input: CreateProjectInput): Project;
  updateProject(id: string, patch: ProjectPatch): { ok: true; project: Project } | { ok: false };
  addProjectUpdate(projectId: string, input: CreateProjectUpdateInput): ProjectUpdate | undefined;
  projectProgress(projectId: string): Progress;
  milestoneProgress(milestoneId: string): Progress;
  projectHealth(projectId: string): ProjectHealth | undefined;
  createIssue(input: CreateIssueInput): Issue;
  updateIssue(id: string, patch: IssuePatch): UpdateIssueResult;
};

export function createKernel(seed: KernelSeed = {}): ProductKernel {
  const viewer = seed.viewer ?? "";
  const teamKey = seed.teamKey ?? "XXH";
  let issues = (seed.issues ?? []).map(copyIssue);
  let projects = (seed.projects ?? []).map(copyProject);
  const views = (seed.views ?? []).map(copyView);
  const milestones = (seed.milestones ?? []).map((item) => ({ ...item }));

  function teamIssues(): Issue[] {
    return issues.filter((item) => item.teamKey === teamKey);
  }

  function issuesForProject(projectId: string): Issue[] {
    const project = findProject(projects, projectId);
    if (!project) return [];
    return issues.filter((item) => item.projectId === project.id);
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
    projectIssues: issuesForProject,
    getProject: (id) => findProject(projects, id),
    createProject(input) {
      const slugId = uniqueSlug(input.slugId ?? slugify(input.name), projects);
      const created: Project = {
        id: slugId,
        slugId,
        name: input.name.trim() || "Untitled project",
        description: input.description ?? "",
        status: "backlog",
        priority: 0,
        memberIds: [],
        teamKeys: [teamKey],
        initiativeIds: [],
        labels: [],
        weekProgress: [],
        nextFocus: [],
        risks: "",
        resources: [],
        updates: [],
      };
      if (input.lead) created.lead = input.lead;
      if (input.startDate) created.startDate = input.startDate;
      if (input.targetDate) created.targetDate = input.targetDate;
      projects = [created, ...projects];
      return created;
    },
    updateProject(id, patch) {
      const current = findProject(projects, id);
      if (!current) return { ok: false };
      applyProjectPatch(current, patch);
      projects = projects.slice();
      return { ok: true, project: current };
    },
    addProjectUpdate(projectId, input) {
      const current = findProject(projects, projectId);
      if (!current) return undefined;
      const update: ProjectUpdate = {
        id: `upd-${current.updates.length + 1}-${Date.now()}`,
        health: input.health,
        body: input.body,
        author: input.author ?? viewer,
        time: input.time ?? "now",
      };
      current.updates = [update, ...current.updates];
      projects = projects.slice();
      return update;
    },
    projectProgress(projectId) {
      return estimateProgress(issuesForProject(projectId));
    },
    milestoneProgress(milestoneId) {
      if (!milestones.some((item) => item.id === milestoneId)) return estimateProgress([]);
      return estimateProgress(issues.filter((item) => item.milestoneId === milestoneId));
    },
    projectHealth(projectId) {
      const current = findProject(projects, projectId);
      return current?.updates[0]?.health;
    },
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
      const project = findProject(projects, input.projectId);
      if (project) created.projectId = project.id;
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
      if (patch.projectId) {
        const project = findProject(projects, patch.projectId);
        if (!project) return { ok: false, error: "unknown-project" };
        patch = { ...patch, projectId: project.id };
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

export function estimateProgress(issues: Issue[]): Progress {
  const live = issues.filter((item) => item.status !== "canceled");
  const scope = live.reduce((sum, item) => sum + issueWeight(item), 0);
  const started = live
    .filter((item) => item.status === "progress")
    .reduce((sum, item) => sum + issueWeight(item), 0);
  const completed = live.filter((item) => item.status === "done").reduce((sum, item) => sum + issueWeight(item), 0);
  return { scope, started, completed, ratio: scope === 0 ? 0 : (completed + 0.25 * started) / scope };
}

function issueWeight(issue: Issue): number {
  return issue.estimate ?? 1;
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
  if (patch.projectId !== undefined) {
    if (patch.projectId === null) delete issue.projectId;
    else issue.projectId = patch.projectId;
  }
}

function applyProjectPatch(project: Project, patch: ProjectPatch): void {
  if (patch.name !== undefined) project.name = patch.name;
  if (patch.description !== undefined) project.description = patch.description;
  if (patch.status !== undefined) project.status = patch.status;
  if (patch.priority !== undefined) project.priority = patch.priority;
  if (patch.lead !== undefined) {
    if (patch.lead === null) delete project.lead;
    else project.lead = patch.lead;
  }
  if (patch.startDate !== undefined) {
    if (patch.startDate === null) delete project.startDate;
    else project.startDate = patch.startDate;
  }
  if (patch.targetDate !== undefined) {
    if (patch.targetDate === null) delete project.targetDate;
    else project.targetDate = patch.targetDate;
  }
}

function findProject(projects: Project[], id: string | undefined): Project | undefined {
  if (!id) return undefined;
  return projects.find((item) => item.id === id || item.slugId === id);
}

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

function uniqueSlug(base: string, projects: Project[]): string {
  const taken = new Set(projects.flatMap((item) => [item.id, item.slugId]));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function copyIssue(issue: Issue): Issue {
  return { ...issue, labels: [...issue.labels] };
}

function copyProject(project: Project): Project {
  const copied: Project = {
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
  delete (copied as { health?: unknown }).health;
  return copied;
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

export type NavId =
  | "inbox"
  | "my-issues"
  | "reviews"
  | "agent"
  | "projects"
  | "views"
  | "loops"
  | "team-home"
  | "team-issues"
  | "triage"
  | "cycles"
  | "initiatives"
  | "settings"
  | "archive"
  | "documents"
  | "pulse";

export type IssueTab = "assigned" | "created" | "subscribed" | "activity";

/** Named states observed in the reference account; categories are separate. */
export type IssueStatus =
  | "backlog"
  | "todo"
  | "progress"
  | "review"
  | "done"
  | "canceled"
  | "duplicate"
  | "triage";

export type Team = {
  id: string;
  key: string;
  name: string;
  createdAt?: string;
  cycleDurationDays?: number;
  triageAcceptStatus?: IssueStatus;
  triageDeclineStatus?: IssueStatus;
  triageRotation?: string[];
  triageRotationIndex?: number;
};

export type IssueLabel = {
  id: string;
  name: string;
  color: string;
  teamKey?: string;
};

export type FavoriteKind = "issue" | "project" | "view" | "document";

export type Favorite = {
  id: string;
  kind: FavoriteKind;
  targetId: string;
};

export type ProjectTab = "overview" | "activity" | "issues";

/** 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low */
export type Priority = 0 | 1 | 2 | 3 | 4;

export type ProjectStatus =
  | "backlog"
  | "planned"
  | "started"
  | "paused"
  | "completed"
  | "canceled";

export type ProjectHealth = "onTrack" | "atRisk" | "offTrack";

export type ViewModelName = "Issue" | "Project" | "Initiative" | "FeedItem";

export type IssueGrouping =
  | "status"
  | "status-type"
  | "priority"
  | "assignee"
  | "agent"
  | "project"
  | "cycle"
  | "label"
  | "team"
  | "none";

export type ViewLayout = "list" | "board";

export type Issue = {
  links?: IssueLink[];
  reactions?:Record<string,string[]>;
  deletedAt?: string;
  id: string;
  title: string;
  body: string;
  status: IssueStatus;
  date: string;
  labels: string[];
  priority: Priority;
  subscribed: boolean;
  assignee?: string;
  creator?: string;
  teamKey: string;
  projectId?: string;
  milestoneId?: string;
  estimate?: number;
  parentId?: string;
  cycleId?: string;
  duplicateOfId?: string;
  snoozedUntil?: string;
  dueDate?: string;
  createdAt?: string;
  updatedAt?: string;
  agent?: string;
};

export type IssueLink = { id: string; url: string; title: string };

export type Activity = {
  reactions?:Record<string,string[]>;
  id: string;
  issueId: string;
  text: string;
  time: string;
  kind?: "comment" | "description";
  editedAt?: string;
  deletedAt?: string;
  parentId?: string;
  body?: string;
  author?: string;
};

export type ConfirmationAction =
  | "coding-session"
  | "approve"
  | "request-changes"
  | "merge"
  | "comment";

export type ConfirmationRequest = {
  action: ConfirmationAction;
  issueId?: string;
  reviewId?: string;
  loopRunId?: string;
  body?: string;
};

export type InboxItem = {
  kind?: "reminder" | "confirmation";
  id: string;
  issueId: string;
  text: string;
  time: string;
  read: boolean;
  archivedAt?: string;
  snoozedUntil?: string;
  confirmation?: ConfirmationRequest;
};

export type ReviewComment = { id: string; author: string; body: string; time: string; githubId?: number };

export type ReviewCheck = { name: string; state: string };

export type ReviewFile = { filename: string; status: string; patch?: string };

export type Review = {
  id: string;
  title: string;
  author: string;
  approved: boolean;
  status?: "draft" | "review" | "changes" | "ready" | "merged" | "closed";
  issueIds?: string[];
  reviewers?: string[];
  url?: string;
  diff?: string;
  comments?: ReviewComment[];
  github?: { owner: string; repo: string; number: number; headSha?: string };
  checks?: ReviewCheck[];
  files?: ReviewFile[];
};

export type ProjectMilestone = {
  id: string;
  projectId: string;
  name: string;
  targetDate?: string;
  sortOrder: number;
  description?: string;
};

export type ProjectResource = {
  id: string;
  title: string;
  body?: string;
  url?: string;
};

export type ProjectUpdate = {
  id: string;
  health: ProjectHealth;
  body: string;
  author: string;
  time: string;
};

export type Project = {
  id: string;
  summary?: string;
  slugId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  lead?: string;
  memberIds: string[];
  teamKeys: string[];
  initiativeIds: string[];
  labels: string[];
  startDate?: string;
  targetDate?: string;
  slackChannel?: string;
  weekProgress: string[];
  nextFocus: string[];
  risks: string;
  resources: ProjectResource[];
  updates: ProjectUpdate[];
  /** Local-only dependency edges for timeline overlays. */
  dependsOnProjectIds?: string[];
};

export type Initiative = {
  id: string;
  name: string;
  status: "proposed" | "planned" | "active" | "completed" | "canceled";
  description?: string;
  owner?: string;
  priority?: Priority;
  targetDate?: string;
  updates?: ProjectUpdate[];
};

export type CustomViewFilter = {
  assignedToMe?: boolean;
  createdByMe?: boolean;
  subscribed?: boolean;
  statuses?: IssueStatus[];
  projectId?: string;
  labels?: string[];
  priority?: Priority;
  cycleId?: string;
  teamKey?: string;
  due?: "set" | "unset";
  estimate?: "set" | "unset";
  query?: string;
  and?: CustomViewFilter[];
  or?: CustomViewFilter[];
};

export type CustomView = {
  id: string;
  slugId: string;
  name: string;
  description: string;
  modelName: ViewModelName;
  shared: boolean;
  owner: string;
  icon: "issues" | "focus" | "project";
  grouping: IssueGrouping;
  layout: ViewLayout;
  filter: CustomViewFilter;
  projectFilter?: ProjectViewFilter;
  teamKey?: string;
};

export type ProjectViewFilter = {
  query?: string;
  statuses?: ProjectStatus[];
  lead?: string;
  priority?: Priority;
  labels?: string[];
};

export type Frame = {
  nav: NavId;
  tab: IssueTab;
  issueId: string | null;
  projectId: string | null;
  viewId: string | null;
  projectTab: ProjectTab;
};

export type StatusFilter = "all" | IssueStatus;

export type IssueGroup = {
  key: string;
  label: string;
  status?: IssueStatus;
  items: Issue[];
};

export type StateCategory =
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "canceled"
  | "triage";
export type Cycle = {
  id: string;
  number: number;
  name: string;
  startDate: string;
  endDate: string;
  capacity: number;
  description: string;
  teamKey?: string;
};
export type Attachment = {
  id: string;
  ownerId: string;
  name: string;
  mime: string;
  size: number;
  blob: Blob;
};
export type DisplayPreferences = {
  layout: ViewLayout;
  grouping: IssueGrouping;
  ordering: "created" | "updated" | "priority" | "title" | "status" | "due";
  direction: "asc" | "desc";
  completed: "all" | "none" | "week";
  subIssues: boolean;
  triage: boolean;
  nested: boolean;
  properties: string[];
};
export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  issueIds?: string[];
  draft?: { title: string; body: string };
  projectDraft?: { name: string; description: string };
  attachmentIds?: string[];
};
export type AgentChat = {
  id: string;
  title: string;
  createdAt: string;
  messages: AgentMessage[];
};
export type LoopTrigger =
  | "manual"
  | "triage"
  | "issue-updated"
  | "hourly"
  | "daily"
  | "weekly";
export type LoopAction =
  | "summarize"
  | "assign-owner"
  | "raise-priority"
  | "coding-session"
  | "slack-reply"
  | "merge";
export type Loop = {
  id: string;
  name: string;
  prompt: string;
  category: string;
  trigger: LoopTrigger;
  action: LoopAction;
  enabled: boolean;
  projectId?: string;
  assignee?: string;
  lastRunAt?: string;
  minimumDemand?: number;
};
export type LoopRun = {
  id: string;
  loopId: string;
  time: string;
  status: "completed" | "limited" | "failed" | "pending";
  result: string;
  issueIds: string[];
  periodStart?: string;
  triggerIssueId?: string;
  triggerActivityId?: string;
  confirmationId?: string;
};

export type CodingSession = {
  id: string;
  issueId: string;
  argv: string[];
  cwd: string;
  status: "running" | "completed" | "failed" | "limited";
  startedAt: string;
  endedAt?: string;
  log: string;
  confirmationId?: string;
};
export type IssueCreationRelation = {
  issueId: string;
  mode: "related" | "blocking" | "blocked-by" | "parent" | "child";
};
export type IssueDraft = {
  copySourceId?: string;
  milestoneId?: string;
  relation?: IssueCreationRelation;
  title: string;
  body: string;
  status: IssueStatus;
  priority: Priority;
  assignee?: string;
  projectId?: string;
  cycleId?: string;
  parentId?: string;
  labels: string[];
  teamKey?: string;
  estimate?: number;
  dueDate?: string;
  templateId?: string;
};


export type WorkspaceDocument = {
  id:string;
  title:string;
  body:string;
  projectId?:string;
  issueId?:string;
  creator:string;
  createdAt:string;
  updatedAt:string;
  deletedAt?:string;
};

export type TemplateRequiredField = "priority" | "assignee" | "project" | "status";

export type IssueTemplate = {
  id:string;
  name:string;
  fields:Omit<IssueDraft,"relation"|"parentId">;
  deletedAt?:string;
  teamKey?:string;
  required?:TemplateRequiredField[];
};

export type ConnectionKind = "github" | "model" | "coding";

export type ConnectionStatus = {
  github?: { connected: boolean; repos: string[]; login?: string };
  model?: { connected: boolean; baseUrl?: string; model?: string };
  coding?: { configured: boolean; argv?: string[]; cwd?: string };
};

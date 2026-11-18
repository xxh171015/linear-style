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
  | "documents";

export type IssueTab = "assigned" | "created" | "subscribed" | "activity";

export type ProjectTab = "overview" | "activity" | "issues";

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

export type InboxItem = {
  id: string;
  issueId: string;
  text: string;
  time: string;
  read: boolean;
  archivedAt?: string;
  snoozedUntil?: string;
};

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
  comments?: { id: string; author: string; body: string; time: string }[];
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
  | "slack-reply";
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
  status: "completed" | "limited" | "failed";
  result: string;
  issueIds: string[];
};
export type IssueCreationRelation = {
  issueId: string;
  mode: "related" | "blocking" | "blocked-by" | "parent" | "child";
};
export type IssueDraft = {
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
};


export type WorkspaceDocument = {
  id:string;
  title:string;
  body:string;
  projectId?:string;
  creator:string;
  createdAt:string;
  updatedAt:string;
  deletedAt?:string;
};

export type IssueTemplate = {
  id:string;
  name:string;
  fields:Omit<IssueDraft,"relation"|"parentId">;
  deletedAt?:string;
};

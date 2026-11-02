export type NavId =
  | "inbox"
  | "my-issues"
  | "reviews"
  | "agent"
  | "projects"
  | "views"
  | "loops"
  | "team-home"
  | "team-issues";

export type IssueTab = "assigned" | "created" | "subscribed" | "activity";

export type ProjectTab = "overview" | "activity" | "issues";

/** Linear workflow state types, collapsed to the replica's five statuses. */
export type IssueStatus = "backlog" | "todo" | "progress" | "done" | "canceled";

/** 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low */
export type Priority = 0 | 1 | 2 | 3 | 4;

export type ProjectStatus = "backlog" | "planned" | "started" | "paused" | "completed" | "canceled";

export type ProjectHealth = "onTrack" | "atRisk" | "offTrack";

export type ViewModelName = "Issue" | "Project" | "Initiative" | "FeedItem";

export type IssueGrouping = "status" | "priority" | "assignee" | "project" | "none";

export type ViewLayout = "list" | "board";

export type Issue = {
  id: string;
  title: string;
  body: string;
  status: IssueStatus;
  date: string;
  labels: string[];
  priority: Priority;
  assigned: boolean;
  created: boolean;
  subscribed: boolean;
  assignee?: string;
  creator?: string;
  teamKey: string;
  projectId?: string;
  milestoneId?: string;
  cycleId?: string;
  estimate?: number;
  parentId?: string;
};

export type Activity = {
  id: string;
  issueId: string;
  text: string;
  time: string;
};

export type InboxItem = {
  id: string;
  issueId: string;
  text: string;
  time: string;
  read: boolean;
};

export type Review = {
  id: string;
  title: string;
  author: string;
  approved: boolean;
};

export type ProjectMilestone = {
  id: string;
  projectId: string;
  name: string;
  targetDate?: string;
  sortOrder: number;
};

export type ProjectResource = {
  id: string;
  title: string;
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
  health?: ProjectHealth;
  slackChannel?: string;
  weekProgress: string[];
  nextFocus: string[];
  risks: string;
  resources: ProjectResource[];
  updates: ProjectUpdate[];
};

export type Initiative = {
  id: string;
  name: string;
  status: "proposed" | "planned" | "active" | "completed" | "canceled";
};

export type CustomViewFilter = {
  assignedToMe?: boolean;
  createdByMe?: boolean;
  subscribed?: boolean;
  statuses?: IssueStatus[];
  projectId?: string;
  labels?: string[];
  priority?: Priority;
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
  teamKey?: string;
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

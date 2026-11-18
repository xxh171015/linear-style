import { mergeWorkspace, WorkspaceConflict } from "./workspace-merge";
import {
  offlineServices,
  type ServiceAdapters,
  type ReviewAction,
} from "./services";
import { DEFAULT_PROJECT_DISPLAY, scheduleDates, type ProjectDisplay } from "./timeline";
import { canonicalPair, relationKey, validateRelations, type Relation, type RelationScope, type IssueRelationMode } from "./relations";
import {
  createKernel,
  estimateProgress,
  ISSUE_STATUSES,
  ISSUE_GROUPINGS,
  PROJECT_STATUSES,
  type CreateIssueInput,
  type IssuePatch,
  type Progress,
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
import type {
  Activity,
  AgentChat,
  Attachment,
  CustomView,
  CustomViewFilter,
  Cycle,
  DisplayPreferences,
  InboxItem,
  Initiative,
  Issue,
  IssueDraft,
  IssueCreationRelation,
  Loop,
  LoopRun,
  Project,
  ProjectViewFilter,
  ProjectMilestone,
  Review,
  StateCategory,
} from "./types";

export const CATEGORY: Record<Issue["status"], StateCategory> = {
  backlog: "backlog",
  todo: "unstarted",
  progress: "started",
  review: "started",
  done: "completed",
  canceled: "canceled",
  duplicate: "canceled",
  triage: "triage",
};
export const DEFAULT_DISPLAY: DisplayPreferences = {
  layout: "list",
  grouping: "none",
  ordering: "created",
  direction: "desc",
  completed: "all",
  subIssues: true,
  triage: true,
  nested: true,
  properties: [
    "ID",
    "Status",
    "Priority",
    "Project",
    "Labels",
    "Assignee",
    "Created",
    "Pull requests",
  ],
};
export const emptyDraft = (): IssueDraft => ({
  title: "",
  body: "",
  status: "backlog",
  priority: 0,
  labels: [],
});
export const uid = (prefix = "id") =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
export const day = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const stamp = () => new Date().toISOString();
export function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value,
  );
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function normalizeLegacyDate(value?: string): string | undefined {
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match =
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})$/.exec(value);
  if (!match) return value;
  const month =
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(match[1]) + 1;
  return `2026-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}
export function cyclePhase(
  cycle: Cycle,
  today = day(),
): "Completed" | "Current" | "Upcoming" | "Planned" {
  if (cycle.endDate < today) return "Completed";
  if (cycle.startDate <= today) return "Current";
  const days = (Date.parse(cycle.startDate) - Date.parse(today)) / 86400000;
  return days <= 7 ? "Upcoming" : "Planned";
}
export type WorkspaceData = {
  version: 2;
  documents: import("./types").WorkspaceDocument[];
  templates: import("./types").IssueTemplate[];
  issues: Issue[];
  projects: Project[];
  views: CustomView[];
  milestones: ProjectMilestone[];
  initiatives: Initiative[];
  cycles: Cycle[];
  activity: Activity[];
  inbox: InboxItem[];
  reviews: Review[];
  attachments: Attachment[];
  chats: AgentChat[];
  loops: Loop[];
  runs: LoopRun[];
  draft: IssueDraft;
  preferences: Record<string, DisplayPreferences>;
  projectPreferences: Record<string, ProjectDisplay>;
  relations: Relation[];
  favorites: string[];
  settings: { workspace: string; user: string; weekStartsOn: number; desktopNotifications?:boolean };
  revision: number;
};
export function initialData(): WorkspaceData {
  const monday = new Date();
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const cycles: Cycle[] = [-1, 0, 1, 2].map((offset, i) => {
    const start = new Date(monday);
    start.setDate(start.getDate() + offset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
      id: `cycle-${i + 1}`,
      number: i + 1,
      name: `Cycle ${i + 1}`,
      startDate: day(start),
      endDate: day(end),
      capacity: 8,
      description: "",
    };
  });
  const issues = structuredClone(seedIssues).map((issue, i) => ({
    ...issue,
    createdAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
    updatedAt: stamp(),
    ...(issue.labels.includes("needs-spec")
      ? { status: "triage" as const }
      : {}),
    ...(i < 3 ? { cycleId: "cycle-2" } : {}),
  }));
  return {
    version: 2,
    issues,
    projects: structuredClone(seedProjects).map((p) => ({
      ...p,
      summary: p.summary ?? p.description,
      description: p.summary === undefined ? "" : p.description,
      startDate: normalizeLegacyDate(p.startDate),
      targetDate: normalizeLegacyDate(p.targetDate),
    })),
    views: structuredClone(seedViews),
    milestones: structuredClone(seedMilestones).map((m) => ({
      ...m,
      targetDate: normalizeLegacyDate(m.targetDate),
    })),
    initiatives: structuredClone(seedInitiatives),
    cycles,
    activity: structuredClone(seedActivity),
    inbox: structuredClone(seedInbox),
    reviews: structuredClone(seedReviews).map((r) => ({
      ...r,
      status: r.approved ? "ready" : "review",
      issueIds: [],
      reviewers: [CURRENT_USER],
      comments: [],
    })),
    documents: [],
    templates: [],
    attachments: [],
    chats: [],
    loops: [],
    runs: [],
    draft: emptyDraft(),
    preferences: {},
    projectPreferences: {},
    relations: [],
    favorites: [],
    settings: { workspace: "xxh", user: CURRENT_USER, weekStartsOn: 1 },
    revision: 0,
  };
}
const validReaction=(emoji:string)=>emoji.trim()===emoji && [...emoji].length<=12 && /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(emoji) && !/\s/u.test(emoji);
export function migrateData(input: unknown): WorkspaceData {
  if (!input || typeof input !== "object")
    throw Error("The saved workspace is not a valid document.");
  const raw = input as Record<string, unknown>;
  if (raw.version !== 1 && raw.version !== 2)
    throw Error("This workspace version is not supported.");
  const defaults = initialData();
  for (const key of ["issues", "projects", "views", "milestones"] as const)
    if (!Array.isArray(raw[key])) throw Error(`Saved ${key} are missing.`);
  const result = {
    ...defaults,
    ...structuredClone(raw),
    version: 2,
  } as WorkspaceData;
  for (const key of [
    "issues",
    "projects",
    "views",
    "milestones",
    "initiatives",
    "cycles",
    "activity",
    "inbox",
    "reviews",
    "attachments",
    "documents",
    "templates",
    "chats",
    "loops",
    "runs",
    "relations",
  ] as const) {
    if (!Array.isArray(result[key])) throw Error(`Saved ${key} are invalid.`);
    const ids = new Set<string>();
    for (const item of result[key]) {
      if (!item || typeof item.id !== "string" || ids.has(item.id))
        throw Error(`Saved ${key} contain an invalid or duplicate ID.`);
      ids.add(item.id);
    }
  }
  for (const issue of result.issues)
    if (
      !ISSUE_STATUSES.includes(issue.status) ||
      !Array.isArray(issue.labels) ||
      !issue.labels.every((label) => typeof label === "string") ||
      ![0, 1, 2, 3, 4].includes(issue.priority) ||
      (issue.estimate !== undefined &&
        (!Number.isFinite(issue.estimate) || issue.estimate < 0)) ||
      (issue.deletedAt !== undefined && (typeof issue.deletedAt !== "string" || !Number.isFinite(Date.parse(issue.deletedAt)))) ||
      typeof issue.title !== "string" ||
      typeof issue.body !== "string"
    )
      throw Error("A saved issue is invalid.");
  for(const template of result.templates) {
    const fields=template.fields;
    if(typeof template.name!=="string" || !fields || typeof fields.title!=="string" || typeof fields.body!=="string" || !ISSUE_STATUSES.includes(fields.status) || ![0,1,2,3,4].includes(fields.priority) || !Array.isArray(fields.labels) || fields.labels.some(label=>typeof label!=="string") ||
      (template.deletedAt!==undefined && (typeof template.deletedAt!=="string" || !Number.isFinite(Date.parse(template.deletedAt)))) ||
      "relation" in fields || "parentId" in fields ||
      (fields.projectId && !result.projects.some(project=>project.id===fields.projectId)) ||
      (fields.cycleId && !result.cycles.some(cycle=>cycle.id===fields.cycleId)) ||
      (fields.milestoneId && !result.milestones.some(m=>m.id===fields.milestoneId && m.projectId===fields.projectId)))throw Error("A saved issue template is invalid.");
  }
  for (const doc of result.documents) {
    if(typeof doc.title!=="string" || typeof doc.body!=="string" || typeof doc.creator!=="string" ||
      [doc.createdAt,doc.updatedAt,...(doc.deletedAt?[doc.deletedAt]:[])].some(time=>typeof time!=="string" || !Number.isFinite(Date.parse(time))) ||
      (doc.projectId && !result.projects.some(project=>project.id===doc.projectId)))throw Error("A saved document is invalid.");
  }
  for(const item of [...result.issues,...result.activity]) {
    if(item.reactions!==undefined && (!item.reactions || typeof item.reactions!=="object" || Array.isArray(item.reactions) || Object.entries(item.reactions).some(([emoji,people])=>!validReaction(emoji) || !Array.isArray(people) || people.some(person=>typeof person!=="string") || new Set(people).size!==people.length)))throw Error("Saved reactions are invalid.");
  }
  for (const item of result.inbox) {
    if (typeof item.issueId !== "string" || typeof item.text !== "string" ||
      typeof item.time !== "string" || typeof item.read !== "boolean" ||
      [item.archivedAt, item.snoozedUntil].some(value => value !== undefined &&
        (typeof value !== "string" || !Number.isFinite(Date.parse(value)))))
      throw Error("A saved notification is invalid.");
  }
  for (const item of result.activity) {
    if (item.kind !== undefined && (!["comment","description"].includes(item.kind) || typeof item.body !== "string" || typeof item.author !== "string"))
      throw Error("A saved comment is invalid.");
    if ([item.editedAt,item.deletedAt].some(value=>value!==undefined && (typeof value!=="string" || !Number.isFinite(Date.parse(value)))))
      throw Error("Saved comment dates are invalid.");
    if (item.parentId && !result.activity.some(parent=>parent.id===item.parentId && parent.issueId===item.issueId && parent.kind==="comment" && !parent.parentId && parent.id!==item.id))
      throw Error("A saved comment thread is invalid.");
  }
  if (
    !result.settings ||
    typeof result.settings.user !== "string" ||
    typeof result.settings.workspace !== "string" ||
    (result.settings.desktopNotifications!==undefined && typeof result.settings.desktopNotifications!=="boolean")
  )
    throw Error("Saved settings are invalid.");
  if (
    !result.draft ||
    typeof result.draft.title !== "string" ||
    !Array.isArray(result.draft.labels)
  )
    throw Error("Saved draft is invalid.");
  if (result.draft.relation && (typeof result.draft.relation.issueId !== "string" ||
      !["related", "blocking", "blocked-by", "parent", "child"].includes(result.draft.relation.mode)))
    throw Error("Saved draft relationship is invalid.");
  if (
    typeof result.revision !== "number" ||
    !Number.isFinite(result.revision) ||
    result.revision < 0
  )
    throw Error("Saved revision is invalid.");
  for (const project of result.projects) {
    for (const key of [
      "memberIds",
      "teamKeys",
      "initiativeIds",
      "labels",
      "weekProgress",
      "nextFocus",
      "resources",
      "updates",
    ] as const)
      if (!Array.isArray(project[key]))
        throw Error("A saved project is incomplete.");
    if (
      typeof project.name !== "string" ||
      typeof project.description !== "string"
    )
      throw Error("A saved project is invalid.");
  }
  for (const view of result.views)
    if (
      typeof view.name !== "string" ||
      !view.filter ||
      typeof view.filter !== "object" ||
      Array.isArray(view.filter)
    )
      throw Error("A saved view is invalid.");
  if (
    !Array.isArray(result.favorites) ||
    !result.favorites.every((id) => typeof id === "string")
  )
    throw Error("Saved favorites are invalid.");
  if (!result.preferences || typeof result.preferences !== "object")
    throw Error("Saved display preferences are invalid.");
  for (const pref of Object.values(result.preferences))
    if (
      !pref ||
      !Array.isArray(pref.properties) ||
      !["list", "board"].includes(pref.layout)
    )
      throw Error("A saved display preference is invalid.");
  for (const attachment of result.attachments)
    if (
      !(attachment.blob instanceof Blob) ||
      typeof attachment.ownerId !== "string"
    )
      throw Error("A saved attachment is invalid.");
  for (const chat of result.chats)
    if (!Array.isArray(chat.messages) || typeof chat.title !== "string")
      throw Error("A saved conversation is invalid.");
  for (const cycle of result.cycles)
    if (
      typeof cycle.startDate !== "string" ||
      typeof cycle.endDate !== "string" ||
      typeof cycle.name !== "string" ||
      !Number.isFinite(cycle.capacity)
    )
      throw Error("A saved cycle is invalid.");
  const issueMap = new Map(result.issues.map((issue) => [issue.id, issue]));
  const projectsById = new Map(
    result.projects.map((project) => [project.id, project]),
  );
  const milestonesById = new Map(
    result.milestones.map((milestone) => [milestone.id, milestone]),
  );
  const cycleIds = new Set(result.cycles.map((cycle) => cycle.id));
  for (const issue of result.issues) {
    if (issue.projectId && !projectsById.has(issue.projectId))
      throw Error("A saved issue references a missing project.");
    if (issue.cycleId && !cycleIds.has(issue.cycleId))
      throw Error("A saved issue references a missing cycle.");
    if (
      issue.milestoneId &&
      (!issue.projectId ||
        !milestonesById.has(issue.milestoneId) ||
        milestonesById.get(issue.milestoneId)?.projectId !== issue.projectId)
    )
      throw Error("A saved milestone does not belong to the issue project.");
  }
  for (const relation of ["parentId", "duplicateOfId"] as const) {
    const visited = new Set<string>();
    for (const issue of result.issues) {
      let next: string | undefined = issue.id;
      const path = new Set<string>();
      while (next && !visited.has(next)) {
        if (path.has(next))
          throw Error(`A saved ${relation} relationship contains a cycle.`);
        path.add(next);
        const record = issueMap.get(next);
        if (!record) throw Error(`A saved ${relation} target is missing.`);
        next = record[relation];
      }
      for (const id of path) visited.add(id);
    }
  }
  const validateFilter = (filter: CustomViewFilter, depth = 0): void => {
    if (
      depth > 12 ||
      !filter ||
      typeof filter !== "object" ||
      Array.isArray(filter)
    )
      throw Error("A saved view filter is invalid.");
    for (const group of [filter.and, filter.or])
      if (group !== undefined) {
        if (!Array.isArray(group))
          throw Error("A saved filter group is invalid.");
        for (const child of group) validateFilter(child, depth + 1);
      }
    if (
      filter.statuses !== undefined &&
      (!Array.isArray(filter.statuses) ||
        !filter.statuses.every((status) => ISSUE_STATUSES.includes(status)))
    )
      throw Error("A saved filter status is invalid.");
    if (
      filter.labels !== undefined &&
      (!Array.isArray(filter.labels) ||
        !filter.labels.every((label) => typeof label === "string"))
    )
      throw Error("A saved label filter is invalid.");
  };
  for (const view of result.views) {
    validateFilter(view.filter);
    if (
      view.projectFilter?.statuses &&
      !view.projectFilter.statuses.every((status) =>
        PROJECT_STATUSES.includes(status),
      )
    )
      throw Error("A saved project filter is invalid.");
  }
  for (const pref of Object.values(result.preferences))
    if (!ISSUE_GROUPINGS.includes(pref.grouping))
      throw Error("A saved grouping is invalid.");
  if (!result.projectPreferences || typeof result.projectPreferences !== "object" || Array.isArray(result.projectPreferences))
    throw Error("Saved project display preferences are invalid.");
  for (const [key, pref] of Object.entries(result.projectPreferences)) {
    if (!pref || !["list", "board", "timeline"].includes(pref.layout) ||
      !["Year", "Quarter", "Month", "Week"].includes(pref.zoom) ||
      !["none", "status", "lead", "priority"].includes(pref.grouping) ||
      !["Manual", "Name", "Health", "Priority", "Lead", "Target date", "Issues", "Status"].includes(pref.ordering) ||
      (["showClosed", "showProjectList", "showWeekNumbers", "showCycles", "showDependencies"] as const).some(
        key => pref[key] !== undefined && typeof pref[key] !== "boolean",
      ))
      throw Error("A saved project display preference is invalid.");
    result.projectPreferences[key] = { ...DEFAULT_PROJECT_DISPLAY, ...pref };
  }
  for (const project of result.projects) {
    if (project.dependsOnProjectIds !== undefined) {
      if (!Array.isArray(project.dependsOnProjectIds) || project.dependsOnProjectIds.some(id => typeof id !== "string"))
        throw Error("A saved project dependency list is invalid.");
      project.dependsOnProjectIds = [...new Set(project.dependsOnProjectIds)];
    }
    if (project.summary === undefined) {
      project.summary = project.description;
      project.description = "";
    }
    project.startDate = normalizeLegacyDate(project.startDate);
    project.targetDate = normalizeLegacyDate(project.targetDate);
  }
  for (const milestone of result.milestones)
    milestone.targetDate = normalizeLegacyDate(milestone.targetDate);
  validateRelations(result.relations, result.issues, result.projects);
  result.relations = result.relations.map(relation => ({ ...relation, ...canonicalPair(relation.type, relation.sourceId, relation.targetId) }));
  return structuredClone(result);
}
export function matchesFilter(
  issue: Issue,
  filter: CustomViewFilter,
  viewer: string,
): boolean {
  if (filter.and && !filter.and.every((f) => matchesFilter(issue, f, viewer)))
    return false;
  if (
    filter.or?.length &&
    !filter.or.some((f) => matchesFilter(issue, f, viewer))
  )
    return false;
  return (
    (!filter.assignedToMe || issue.assignee === viewer) &&
    (!filter.createdByMe || issue.creator === viewer) &&
    (!filter.subscribed || issue.subscribed) &&
    (!filter.statuses?.length || filter.statuses.includes(issue.status)) &&
    (!filter.projectId || issue.projectId === filter.projectId) &&
    (!filter.cycleId || issue.cycleId === filter.cycleId) &&
    (!filter.labels?.length ||
      filter.labels.some((l) => issue.labels.includes(l))) &&
    (filter.priority === undefined || filter.priority === issue.priority) &&
    (!filter.query ||
      `${issue.id} ${issue.title} ${issue.body}`
        .toLowerCase()
        .includes(filter.query.toLowerCase()))
  );
}
export function displayIssues(
  items: Issue[],
  prefs: DisplayPreferences,
  now = new Date(),
): Issue[] {
  const threshold = now.getTime() - 7 * 86400000;
  return items
    .filter(
      (i) =>
        (prefs.triage || i.status !== "triage") &&
        (prefs.subIssues || !i.parentId) &&
        (prefs.completed !== "none" ||
          !["done", "canceled", "duplicate"].includes(i.status)) &&
        (prefs.completed !== "week" ||
          !["done", "canceled", "duplicate"].includes(i.status) ||
          Date.parse(i.updatedAt ?? "") >= threshold),
    )
    .sort((a, b) => {
      const field = (i: Issue): string | number =>
        prefs.ordering === "priority"
          ? i.priority || 5
          : prefs.ordering === "status"
            ? ISSUE_STATUSES.indexOf(i.status)
            : prefs.ordering === "title"
              ? i.title
              : prefs.ordering === "due"
                ? (i.dueDate ?? "9999")
                : prefs.ordering === "updated"
                  ? (i.updatedAt ?? "")
                  : (i.createdAt ?? i.date);
      const x = field(a),
        y = field(b);
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y));
      return prefs.direction === "asc" ? cmp : -cmp;
    });
}
export function initiativeProgress(data: WorkspaceData, id: string): Progress {
  const projects = new Set(
    data.projects.filter((p) => p.initiativeIds.includes(id)).map((p) => p.id),
  );
  return estimateProgress(
    data.issues.filter((i) => i.projectId && projects.has(i.projectId)),
  );
}
export function matchesProjectFilter(
  project: Project,
  filter: ProjectViewFilter,
): boolean {
  return (
    (!filter.query ||
      `${project.name} ${project.description}`
        .toLowerCase()
        .includes(filter.query.toLowerCase())) &&
    (!filter.statuses?.length || filter.statuses.includes(project.status)) &&
    (!filter.lead || project.lead === filter.lead) &&
    (filter.priority === undefined || project.priority === filter.priority) &&
    (!filter.labels?.length ||
      filter.labels.some((label) => project.labels.includes(label)))
  );
}
export interface Repository {
  load(): Promise<unknown | undefined>;
  save(data: WorkspaceData): Promise<void>;
  commit?(data: WorkspaceData, base: WorkspaceData, preferLocal?: boolean): Promise<WorkspaceData>;
  watch?(changed: () => void): () => void;
}
export class IndexedDBRepository implements Repository {
  private db?: Promise<IDBDatabase>;
  private channel?: BroadcastChannel;
  private watchers = new Set<() => void>();
  private open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    let failed = false;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(Error("Local storage is unavailable in this browser."));
        return;
      }
      const request = indexedDB.open("linear-workspace", 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("workspace"))
          request.result.createObjectStore("workspace");
      };
      request.onsuccess = () => {
        const db = request.result;
        if (failed) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          this.db = undefined;
        };
        resolve(db);
      };
      request.onerror = () => {
        failed = true;
        reject(request.error);
      };
      request.onblocked = () => {
        failed = true;
        reject(Error("Close other tabs to upgrade the workspace."));
      };
    });
    this.db = opening;
    void opening.catch(() => {
      if (this.db === opening) this.db = undefined;
    });
    return opening;
  }
  async load(): Promise<unknown | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db
        .transaction("workspace", "readonly")
        .objectStore("workspace")
        .get("current");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async loadOrCreate(seed: WorkspaceData): Promise<unknown> {
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction("workspace","readwrite"),store=tx.objectStore("workspace");let value:unknown;
      const req=store.get("current");req.onsuccess=()=>{value=req.result??seed;if(req.result===undefined)store.put(seed,"current");};
      tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error("Opening storage was interrupted."));
    });
  }
  watch(changed:()=>void) {
    this.watchers.add(changed);
    if(!this.channel && typeof BroadcastChannel!=="undefined") {
      this.channel=new BroadcastChannel("linear-workspace:changes");
      this.channel.onmessage=()=>{for(const callback of this.watchers)callback();};
    }
    if(typeof window!=="undefined")window.addEventListener("focus",changed);
    return ()=>{this.watchers.delete(changed);if(typeof window!=="undefined")window.removeEventListener("focus",changed);if(!this.watchers.size){this.channel?.close();this.channel=undefined;}};
  }
  private notify(revision:number) {
    if(typeof BroadcastChannel!=="undefined") {
      const channel=this.channel??new BroadcastChannel("linear-workspace:changes");channel.postMessage({revision});if(channel!==this.channel)channel.close();
    }
    for(const callback of this.watchers)callback();
  }
  async commit(data:WorkspaceData,base:WorkspaceData,preferLocal=false):Promise<WorkspaceData> {
    for(let attempt=0;attempt<8;attempt++) {
      const raw=await this.load();
      const shared=raw===undefined?base:migrateData(raw);
      const next=migrateData(await mergeWorkspace(base,data,shared,preferLocal));
      const db=await this.open();
      const accepted=await new Promise<boolean>((resolve,reject)=>{
        const tx=db.transaction("workspace","readwrite"),store=tx.objectStore("workspace");let stale=false;
        const req=store.get("current");req.onsuccess=()=>{
          if(req.result?.revision!==(raw as WorkspaceData|undefined)?.revision){stale=true;tx.abort();}
          else store.put(next,"current");
        };
        tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);tx.onabort=()=>stale?resolve(false):reject(tx.error??Error("Saving was interrupted."));
      });
      if(accepted){this.notify(next.revision);return next;}
    }
    throw Error("The workspace is busy in another window. Retry saving.");
  }
  async save(data:WorkspaceData) { const loaded=await this.load();await this.commit(data,loaded===undefined?data:migrateData(loaded)); }

}
export class Workspace {
  private data: WorkspaceData;
  private committedLocal: WorkspaceData;
  private disposeRepository?: () => void;
  private remotePending = false;
  private editSequence = 0;
  saveConflict = false;
  private activeSnapshot?: WorkspaceData;
  private activeSource?: WorkspaceData;
  private listeners = new Set<() => void>();
  private saving: Promise<void> = Promise.resolve();
  private repository?: Repository;
  private services: ServiceAdapters;
  saveState: "saved" | "saving" | "error" = "saved";
  saveError = "";
  constructor(
    data = initialData(),
    repository?: Repository,
    services = offlineServices,
  ) {
    this.services = services;
    this.data = structuredClone(data);
    this.committedLocal = this.data;
    this.repository = repository;
    this.disposeRepository = repository?.watch?.(() => { void this.refreshShared(); });
  }
  dispose() { this.disposeRepository?.(); this.disposeRepository=undefined; }
  async refreshShared() {
    if(!this.repository)return;
    if(this.saveState!=="saved"){this.remotePending=true;return;}
    const sequence=this.editSequence;
    try {
      const loaded=await this.repository.load();
      if(sequence!==this.editSequence||this.saveState!=="saved"){this.remotePending=true;return;}
      if(loaded!==undefined) {
        const next=migrateData(loaded);
        if(next.revision>this.data.revision){this.data=next;this.committedLocal=next;this.publish();}
      }
    } catch(error) { this.saveError=error instanceof Error?error.message:String(error);this.publish(); }
  }
  async useSharedChanges() {
    await this.flushed();
    const loaded=await this.repository?.load();
    if(loaded===undefined)throw Error("No saved workspace is available.");
    this.data=migrateData(loaded);this.committedLocal=this.data;this.editSequence++;
    this.saveState="saved";this.saveError="";this.saveConflict=false;this.publish();
  }
  getSnapshot = () => this.data;
  getActiveSnapshot = () => {
    if (this.activeSource !== this.data) {
      const issues = this.data.issues.filter(issue => !issue.deletedAt);
      const ids = new Set(issues.map(issue => issue.id));
      const deletedIds = new Set(this.data.issues.filter(issue => issue.deletedAt).map(issue => issue.id));
      this.activeSnapshot = { ...this.data, issues,
        inbox: this.data.inbox.filter(item => !deletedIds.has(item.issueId)),
        activity: this.data.activity.filter(item => !deletedIds.has(item.issueId)),
        favorites: this.data.favorites.filter(id => !this.data.issues.some(issue => issue.id === id && issue.deletedAt)),
        relations: this.data.relations.filter(r => r.scope !== "issue" || (ids.has(r.sourceId) && ids.has(r.targetId))),
      };
      this.activeSource = this.data;
    }
    return this.activeSnapshot!;
  };
  deleteIssue(id: string) {
    if (!this.data.issues.some(issue => issue.id === id && !issue.deletedAt)) throw Error("Issue not found.");
    this.mutate(draft => {
      const issue = draft.issues.find(issue => issue.id === id)!;
      issue.deletedAt = stamp(); issue.updatedAt = issue.deletedAt;
      this.event(draft, issue, "deleted this issue");
    });
  }
  restoreIssue(id: string) {
    if (!this.data.issues.some(issue => issue.id === id && issue.deletedAt)) throw Error("Deleted issue not found.");
    this.mutate(draft => {
      const issue = draft.issues.find(issue => issue.id === id)!;
      delete issue.deletedAt; issue.updatedAt = stamp();
      this.event(draft, issue, "restored this issue");
    });
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish() {
    for (const fn of this.listeners) fn();
  }
  mutate(fn: (draft: WorkspaceData) => void) {
    const next = structuredClone(this.data);
    fn(next);
    next.revision = this.data.revision + 1;
    this.data = next;
    this.editSequence++;
    this.save();
    this.publish();
  }
  private save(preferLocal=false) {
    if (!this.repository) return;
    this.saveState = "saving";
    const snapshot = structuredClone(this.data), sequence=this.editSequence;
    this.saving = this.saving.catch(()=>{}).then(async()=>{
      const result=this.repository!.commit
        ? await this.repository!.commit(snapshot,this.committedLocal,preferLocal)
        : (await this.repository!.save(snapshot),snapshot);
      this.committedLocal=snapshot;
      if(sequence===this.editSequence){this.data=result;this.committedLocal=result;this.saveState="saved";this.saveError="";this.saveConflict=false;}
      this.publish();
      if(this.remotePending&&this.saveState==="saved"){this.remotePending=false;void this.refreshShared();}
    }).catch(error=>{
      this.saveState="error";this.saveConflict=error instanceof WorkspaceConflict;
      this.saveError=error instanceof Error?error.message:String(error);this.publish();
    });
  }
  retrySave = () => { this.save();this.publish(); };
  keepLocalChanges = () => { this.save(true);this.publish(); };
  async flushed() {
    await this.saving;
  }
  patchProject(id: string, patch: Partial<Pick<Project, "status" | "dependsOnProjectIds">>) {
    if (patch.dependsOnProjectIds && patch.dependsOnProjectIds.includes(id))
      throw Error("A project cannot depend on itself.");
    this.mutate((draft) => {
      const project = draft.projects.find((item) => item.id === id);
      if (!project) throw Error("This project is no longer available.");
      if (patch.status) project.status = patch.status;
      if (patch.dependsOnProjectIds)
        project.dependsOnProjectIds = [...new Set(patch.dependsOnProjectIds)];
    });
  }
  setProjectSchedule(id: string, startDate?: string, targetDate?: string) {
    const dates = scheduleDates(startDate, targetDate);
    if (!this.data.projects.some(project => project.id === id)) throw Error("Project not found.");
    this.mutate(draft => { Object.assign(draft.projects.find(project => project.id === id)!, dates); });
  }
  addRelation(scope: RelationScope, type: Relation["type"], sourceId: string, targetId: string) {
    const relation: Relation = {id:uid("relation"),scope,type,...canonicalPair(type,sourceId,targetId),createdAt:stamp()};
    if (scope === "issue" && [sourceId,targetId].some(id => !this.data.issues.some(issue => issue.id === id && !issue.deletedAt)))
      throw Error("Relationship target is unavailable.");
    const duplicate=this.data.relations.find(item=>relationKey(item)===relationKey(relation));
    if(duplicate) return duplicate.id;
    validateRelations([...this.data.relations,relation],this.data.issues,this.data.projects);
    this.mutate(d=>{
      d.relations.push(relation);
      if(scope==="issue") {
        for(const id of [relation.sourceId,relation.targetId]) {
          const item=d.issues.find(i=>i.id===id)!;
          item.updatedAt=relation.createdAt;
          const other=id===relation.sourceId?relation.targetId:relation.sourceId;
          const label=type==="related"?"related to":id===relation.sourceId?"blocking":"blocked by";
          this.event(d,item,`${label} ${other}`);
        }
      }
    });
    if(scope==="issue") for(const id of [relation.sourceId,relation.targetId]) this.trigger("issue-updated",id);
    return relation.id;
  }
  removeRelation(id: string) {
    const relation=this.data.relations.find(item=>item.id===id);
    if(!relation) throw Error("Relationship not found.");
    this.mutate(d=>{
      d.relations=d.relations.filter(item=>item.id!==id);
      if(relation.scope==="issue") for(const issueId of [relation.sourceId,relation.targetId]) {
        const issue=d.issues.find(item=>item.id===issueId);
        if(issue) { issue.updatedAt=stamp(); this.event(d,issue,`removed relationship with ${issueId===relation.sourceId?relation.targetId:relation.sourceId}`); }
      }
    });
    if(relation.scope==="issue") for(const issueId of [relation.sourceId,relation.targetId]) this.trigger("issue-updated",issueId);
  }
  linkIssues(sourceId: string, targetId: string, mode: IssueRelationMode) {
    if(sourceId===targetId || !this.data.issues.some(item=>item.id===sourceId && !item.deletedAt) || !this.data.issues.some(item=>item.id===targetId && !item.deletedAt)) throw Error("Choose another existing issue.");
    if(mode==="parent") this.updateIssue(targetId,{parentId:sourceId},`set parent to ${sourceId}`);
    else if(mode==="child") this.updateIssue(sourceId,{parentId:targetId},`set parent to ${targetId}`);
    else if(mode==="duplicate") this.updateIssue(sourceId,{status:"duplicate",duplicateOfId:targetId,snoozedUntil:null},`marked as duplicate of ${targetId}`);
    else if(mode==="related") this.addRelation("issue","related",sourceId,targetId);
    else if(mode==="blocking") this.addRelation("issue","blocks",sourceId,targetId);
    else this.addRelation("issue","blocks",targetId,sourceId);
  }
  updateNotification(
    id: string,
    action: "read" | "unread" | "archive" | "restore" | "snooze",
    until?: string,
  ) {
    if (!this.data.inbox.some((item) => item.id === id))
      throw Error("This notification is no longer available.");
    if (action === "snooze" && (!until || !Number.isFinite(Date.parse(until)) || Date.parse(until) <= Date.now()))
      throw Error("Choose a future reminder time.");
    this.mutate((draft) => {
      const item = draft.inbox.find((entry) => entry.id === id)!;
      if (action === "read" || action === "unread") item.read = action === "read";
      else if (action === "archive") {
        item.archivedAt = stamp();
        delete item.snoozedUntil;
      } else if (action === "restore") {
        delete item.archivedAt;
        delete item.snoozedUntil;
      } else {
        delete item.archivedAt;
        item.snoozedUntil = new Date(until!).toISOString();
      }
    });
  }
  private event(d: WorkspaceData, issue: Issue, text: string, comment?: Pick<Activity, "kind" | "body" | "author" | "parentId">) {
    const time = stamp();
    d.activity.unshift({ id: uid("activity"), issueId: issue.id, text, time, ...comment });
    if (issue.subscribed)
      d.inbox.unshift({
        id: uid("notification"),
        issueId: issue.id,
        text,
        time,
        read: false,
      });
  }
  createIssue(
    input: CreateIssueInput & Partial<Pick<Issue, "cycleId" | "dueDate">> & { relation?: IssueCreationRelation },
    attachmentOwner?: string,
  ): Issue {
    if (!input.title.trim()) throw Error("An issue title is required.");
    if (
      input.estimate !== undefined &&
      (!Number.isFinite(input.estimate) || input.estimate < 0)
    )
      throw Error("Estimate must be a nonnegative number.");
    if (
      input.priority !== undefined &&
      ![0, 1, 2, 3, 4].includes(input.priority)
    )
      throw Error("Invalid priority.");
    let created!: Issue;
    this.mutate((d) => {
      if (input.parentId && !d.issues.some(issue => issue.id === input.parentId && !issue.deletedAt)) throw Error("Parent issue is unavailable.");
      const context = input.relation;
      if (context && (!["related", "blocking", "blocked-by", "parent", "child"].includes(context.mode) ||
          !d.issues.some(issue => issue.id === context.issueId && !issue.deletedAt)))
        throw Error("The related issue is no longer available. Remove the relationship or choose another issue.");
      if (input.cycleId && !d.cycles.some((c) => c.id === input.cycleId))
        throw Error("Cycle not found.");
      if (input.milestoneId && !d.milestones.some(m => m.id === input.milestoneId && m.projectId === input.projectId))
        throw Error("Choose a milestone from the selected project.");
      if (context?.mode === "parent" && input.parentId && input.parentId !== context.issueId)
        throw Error("This issue already has a different parent in the draft.");
      if (context?.mode === "child") {
        let ancestor = input.parentId;
        const seen = new Set([context.issueId]);
        while (ancestor) {
          if (seen.has(ancestor)) throw Error("An issue cannot be its own ancestor.");
          seen.add(ancestor);
          ancestor = d.issues.find(issue => issue.id === ancestor)?.parentId;
        }
      }
      const kernel = createKernel({
        viewer: d.settings.user,
        teamKey: TEAM_KEY,
        ...d,
      });
      created = kernel.createIssue({
        ...input,
        parentId: context?.mode === "parent" ? context.issueId : input.parentId,
        labels: [
          ...new Set(
            (input.labels ?? []).map((label) => label.trim()).filter(Boolean),
          ),
        ],
        date: formatDate(stamp()),
      });
      created.createdAt = stamp();
      created.updatedAt = stamp();
      if (input.cycleId) created.cycleId = input.cycleId;
      if (input.dueDate) created.dueDate = input.dueDate;
      d.issues = kernel.issues();
      if (attachmentOwner)
        for (const file of d.attachments)
          if (file.ownerId === attachmentOwner) file.ownerId = created.id;
      this.event(d, created, "created this issue");
      if (context) {
        const existing = d.issues.find(issue => issue.id === context.issueId)!;
        if (context.mode === "child") existing.parentId = created.id;
        if (context.mode === "parent" || context.mode === "child") {
          existing.updatedAt = created.updatedAt;
          this.event(d, existing, `${context.mode === "parent" ? "parent of" : "sub-issue of"} ${created.id}`);
          this.event(d, created, `${context.mode === "parent" ? "sub-issue of" : "parent of"} ${existing.id}`);
          return;
        }
        const type = context.mode === "related" ? "related" : "blocks";
        const sourceId = context.mode === "blocked-by" ? created.id : existing.id;
        const targetId = context.mode === "blocked-by" ? existing.id : created.id;
        const relation: Relation = { id: uid("relation"), scope: "issue", type,
          ...canonicalPair(type, sourceId, targetId), createdAt: created.createdAt! };
        validateRelations([...d.relations, relation], d.issues, d.projects);
        d.relations.push(relation);
        existing.updatedAt = created.updatedAt;
        const existingLabel = context.mode === "related" ? "related to" : context.mode === "blocking" ? "blocking" : "blocked by";
        const createdLabel = context.mode === "related" ? "related to" : context.mode === "blocking" ? "blocked by" : "blocking";
        this.event(d, existing, `${existingLabel} ${created.id}`);
        this.event(d, created, `${createdLabel} ${existing.id}`);
      }
    });
    this.trigger(
      created.status === "triage" ? "triage" : "issue-updated",
      created.id,
    );
    if (input.relation) this.trigger("issue-updated", input.relation.issueId);
    return created;
  }
  updateIssue(id: string, patch: IssuePatch, text?: string) {
    // Reopening a duplicate removes its canonical link, as observed in Linear.
    patch = { ...patch };
    if (patch.status !== undefined && patch.status !== "duplicate" &&
        this.data.issues.find(issue => issue.id === id)?.status === "duplicate")
      patch.duplicateOfId = null;
    this.mutate((d) => {
      const original = d.issues.find((i) => i.id === id);
      if (!original || original.deletedAt) throw Error("Restore this issue before editing it.");
      if (
        patch.estimate !== undefined &&
        patch.estimate !== null &&
        (!Number.isFinite(patch.estimate) || patch.estimate < 0)
      )
        throw Error("Estimate must be a nonnegative number.");
      if (
        patch.priority !== undefined &&
        ![0, 1, 2, 3, 4].includes(patch.priority)
      )
        throw Error("Invalid priority.");
      if (patch.title !== undefined && !patch.title.trim())
        throw Error("An issue title is required.");
      if (patch.cycleId && !d.cycles.some((c) => c.id === patch.cycleId))
        throw Error("Cycle not found.");
      if (patch.parentId) {
        if (!d.issues.some(issue => issue.id === patch.parentId && !issue.deletedAt)) throw Error("Parent issue is unavailable.");
        let ancestor: string | undefined = patch.parentId;
        const seen = new Set([id]);
        while (ancestor) {
          if (seen.has(ancestor))
            throw Error("An issue cannot be its own ancestor.");
          seen.add(ancestor);
          ancestor = d.issues.find((i) => i.id === ancestor)?.parentId;
        }
      }
      if (patch.duplicateOfId) {
        const target = d.issues.find((i) => i.id === patch.duplicateOfId);
        if (!target || target.deletedAt || target.id === id)
          throw Error("Choose another issue as the duplicate target.");
        let next: string | undefined = target.id;
        const seen = new Set([id]);
        while (next) {
          if (seen.has(next))
            throw Error("Duplicate relationships cannot form a cycle.");
          seen.add(next);
          next = d.issues.find((i) => i.id === next)?.duplicateOfId;
        }
      }
      const kernel = createKernel({
        viewer: d.settings.user,
        teamKey: TEAM_KEY,
        ...d,
      });
      const result = kernel.updateIssue(id, { ...patch, updatedAt: stamp() });
      if (!result.ok) throw Error(result.error.replaceAll("-", " "));
      d.issues = kernel.issues();
      if(patch.body!==undefined && patch.body!==original.body)
        this.event(d,result.issue,text ?? "updated the description",{kind:"description",body:original.body,author:d.settings.user});
      else if (text) this.event(d, result.issue, text);
    });
    this.trigger("issue-updated", id);
  }
  triage(
    id: string,
    action: "accept" | "decline" | "duplicate" | "snooze",
    value?: string,
  ) {
    if (this.data.issues.find((i) => i.id === id)?.status !== "triage")
      throw Error("This issue is no longer in triage.");
    if (action === "snooze") {
      if (!value || Date.parse(value) <= Date.now())
        throw Error("Choose a future snooze time.");
      this.updateIssue(
        id,
        { snoozedUntil: value },
        `snoozed until ${formatDate(value)}`,
      );
    } else if (action === "duplicate") {
      if (!value) throw Error("Choose the original issue.");
      this.updateIssue(
        id,
        { status: "duplicate", duplicateOfId: value, snoozedUntil: null },
        `marked as duplicate of ${value}`,
      );
    } else
      this.updateIssue(
        id,
        {
          status: action === "accept" ? "backlog" : "canceled",
          snoozedUntil: null,
        },
        action === "accept" ? "accepted from triage" : "declined from triage",
      );
  }
  saveIssueTemplate(name:string,fields:import("./types").IssueTemplate["fields"],id=uid("template")) {
    if(!name.trim())throw Error("A template name is required.");
    const {relation:_relation,parentId:_parent,...safeFields}=fields as IssueDraft;
    this.mutate(d=>{
      const template={id,name:name.trim(),fields:structuredClone(safeFields)};
      const existing=d.templates.findIndex(item=>item.id===id);
      if(existing<0)d.templates.push(template);else d.templates[existing]=template;
    });
    return id;
  }
  setTemplateDeleted(id:string,deleted:boolean) {
    this.mutate(d=>{
      const template=d.templates.find(item=>item.id===id);if(!template)throw Error("Template not found.");
      if(deleted)template.deletedAt=stamp();else delete template.deletedAt;
    });
  }
  applyIssueTemplate(id:string) {
    this.mutate(d=>{
      const template=d.templates.find(item=>item.id===id && !item.deletedAt);if(!template)throw Error("Template not found.");
      const current=d.draft,fields=template.fields;
      d.draft={...fields,...current,title:current.title || fields.title,body:current.body || fields.body,
        priority:current.priority || fields.priority,status:current.status!=="backlog"?current.status:fields.status,
        projectId:current.projectId ?? fields.projectId,cycleId:current.cycleId ?? fields.cycleId,
        assignee:current.assignee ?? fields.assignee,milestoneId:current.milestoneId ?? fields.milestoneId,
        labels:[...new Set([...fields.labels,...current.labels])],
      };
      if(d.draft.milestoneId && !d.milestones.some(m=>m.id===d.draft.milestoneId && m.projectId===d.draft.projectId))delete d.draft.milestoneId;
    });
  }
  toggleReaction(scope:"issue"|"comment",id:string,emoji:string) {
    if(!validReaction(emoji))throw Error("Choose a reaction.");
    this.mutate(d=>{
      const item=scope==="issue"?d.issues.find(issue=>issue.id===id):d.activity.find(comment=>comment.id===id && comment.kind==="comment");
      if(!item || item.deletedAt)throw Error("This item is no longer available for reactions.");
      const issueId=scope==="issue"?item.id:(item as Activity).issueId;
      if(!d.issues.some(issue=>issue.id===issueId && !issue.deletedAt))throw Error("Restore this issue before reacting.");
      const reactions={...item.reactions},people=reactions[emoji] ?? [];
      if(people.includes(d.settings.user))reactions[emoji]=people.filter(person=>person!==d.settings.user);
      else reactions[emoji]=[...people,d.settings.user];
      if(!reactions[emoji].length)delete reactions[emoji];
      item.reactions=reactions;
    });
  }
  createDocument(title:string,body="",projectId?:string) {
    if(!title.trim())throw Error("A document title is required.");
    const doc:import("./types").WorkspaceDocument={id:uid("doc"),title:title.trim(),body,projectId,creator:this.data.settings.user,createdAt:stamp(),updatedAt:stamp()};
    this.mutate(d=>{
      if(projectId && !d.projects.some(p=>p.id===projectId))throw Error("Project not found.");
      d.documents.unshift(doc);
    });
    return doc;
  }
  updateDocument(id:string,patch:Partial<Pick<import("./types").WorkspaceDocument,"title"|"body"|"projectId">>) {
    if(patch.title!==undefined && !patch.title.trim())throw Error("A document title is required.");
    this.mutate(d=>{
      const doc=d.documents.find(doc=>doc.id===id && !doc.deletedAt);if(!doc)throw Error("Restore this document before editing.");
      if(patch.projectId && !d.projects.some(p=>p.id===patch.projectId))throw Error("Project not found.");
      Object.assign(doc,patch,{updatedAt:stamp()});
      if(patch.title)doc.title=patch.title.trim();
    });
  }
  setDocumentDeleted(id:string,deleted:boolean) {
    this.mutate(d=>{
      const doc=d.documents.find(doc=>doc.id===id);if(!doc)throw Error("Document not found.");
      if(deleted)doc.deletedAt=stamp();else delete doc.deletedAt;
      doc.updatedAt=stamp();
    });
  }
  editComment(id:string,body:string) {
    if(!body.trim())throw Error("A comment cannot be empty.");
    this.mutate(d=>{
      const comment=d.activity.find(item=>item.id===id && item.kind==="comment" && !item.deletedAt);
      if(!comment || comment.author!==d.settings.user)throw Error("Only your own comments can be edited.");
      if(!d.issues.some(issue=>issue.id===comment.issueId && !issue.deletedAt))throw Error("Restore this issue before editing comments.");
      comment.body=body.trim();comment.text=`${comment.author}: ${comment.body}`;comment.editedAt=stamp();
    });
  }
  setCommentDeleted(id:string,deleted:boolean) {
    this.mutate(d=>{
      const comment=d.activity.find(item=>item.id===id && item.kind==="comment");
      if(!comment || comment.author!==d.settings.user)throw Error("Only your own comments can be removed or restored.");
      if(!d.issues.some(issue=>issue.id===comment.issueId && !issue.deletedAt))throw Error("Restore this issue before changing comments.");
      if(deleted)comment.deletedAt=stamp();else delete comment.deletedAt;
    });
  }
  comment(issueId: string, body: string, parentId?:string) {
    if (!body.trim()) return;
    this.mutate((d) => {
      const issue = d.issues.find((i) => i.id === issueId);
      if (!issue || issue.deletedAt) throw Error("Restore this issue before commenting.");
      const parent=parentId?d.activity.find(item=>item.id===parentId && item.issueId===issueId && item.kind==="comment" && !item.deletedAt):undefined;
      if(parentId && !parent)throw Error("This comment is no longer available to reply to.");
      this.event(d, issue, `${d.settings.user}: ${body.trim()}`, { kind: "comment", body: body.trim(), author: d.settings.user, parentId:parent?.parentId ?? parent?.id });
    });
  }
  addAttachments(ownerId: string, files: File[]) {
    if (this.data.issues.some(issue => issue.id === ownerId && issue.deletedAt)) throw Error("Restore this issue before adding attachments.");
  const created = files.map((file) => ({
      id: uid("file"),
      ownerId,
      name: file.name,
      mime: file.type,
      size: file.size,
      blob: file,
    }));
    this.mutate((d) => {
      for (const attachment of created) d.attachments.push(attachment);
    });
    return created.map((attachment) => attachment.id);
  }
  saveCycle(input: Omit<Cycle, "number"> & { number?: number }) {
    if (
      !input.name.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) ||
      input.endDate < input.startDate ||
      day(new Date(input.startDate + "T12:00:00")) !== input.startDate ||
      day(new Date(input.endDate + "T12:00:00")) !== input.endDate ||
      !Number.isFinite(input.capacity) ||
      input.capacity < 0
    )
      throw Error("Enter a name, valid date range and nonnegative capacity.");
    this.mutate((d) => {
      const index = d.cycles.findIndex((c) => c.id === input.id);
      const cycle = {
        ...input,
        number:
          input.number ?? Math.max(0, ...d.cycles.map((c) => c.number)) + 1,
      };
      if (index < 0) d.cycles.push(cycle);
      else d.cycles[index] = cycle;
    });
  }
  runLoop(id: string, onlyIssueId?: string): LoopRun {
    let run!: LoopRun;
    this.mutate((d) => {
      const loop = d.loops.find((l) => l.id === id);
      if (!loop) throw Error("Loop not found.");
      let issues = d.issues.filter(
        (i) =>
          !i.deletedAt &&
          (!loop.projectId || i.projectId === loop.projectId) &&
          (!onlyIssueId || i.id === onlyIssueId),
      );
      if (loop.trigger === "triage")
        issues = issues.filter((i) => i.status === "triage");
      let result = "";
      let status: LoopRun["status"] = "completed";
      if (loop.action === "assign-owner") {
        const owner = loop.assignee ?? d.settings.user;
        issues = issues.filter((i) => !i.assignee);
        for (const issue of issues) {
          issue.assignee = owner;
          issue.updatedAt = stamp();
          this.event(d, issue, `Loop assigned to ${owner}`);
        }
        result = `Assigned ${issues.length} unassigned issues to ${owner}.`;
      } else if (loop.action === "raise-priority") {
        issues = issues.filter(
          (i) =>
            !["done", "canceled", "duplicate", "triage"].includes(i.status) &&
            d.issues.filter((report) => !report.deletedAt && report.duplicateOfId === i.id).length >=
              (loop.minimumDemand ?? 2),
        );
        for (const issue of issues) {
          issue.priority = 2;
          issue.updatedAt = stamp();
          this.event(d, issue, "Loop set priority to High");
        }
        result = `Set ${issues.length} active issues with at least ${loop.minimumDemand ?? 2} duplicate reports to High priority.`;
      } else if (
        loop.action === "coding-session" ||
        loop.action === "slack-reply"
      ) {
        const outcome = this.services.automations.external(loop.action);
        status = outcome.status;
        result = outcome.message;
      } else result = summarizeIssues(issues, d);
      loop.lastRunAt = stamp();
      run = {
        id: uid("run"),
        loopId: id,
        time: stamp(),
        status,
        result,
        issueIds: issues.map((i) => i.id),
      };
      d.runs.unshift(run);
    });
    return run;
  }
  transitionReview(id: string, action: ReviewAction) {
    this.mutate((d) => {
      const index = d.reviews.findIndex((review) => review.id === id);
      if (index < 0) throw Error("Review not found.");
      d.reviews[index] = this.services.reviews.transition(
        d.reviews[index],
        action,
      );
    });
  }
  private trigger(trigger: Loop["trigger"], issueId: string) {
    for (const loop of this.data.loops.filter(
      (l) => l.enabled && l.trigger === trigger,
    ))
      this.runLoop(loop.id, issueId);
  }
  tick(now = new Date()) {
    for (const loop of this.data.loops.filter(
      (l) => l.enabled && ["hourly", "daily", "weekly"].includes(l.trigger),
    )) {
      const interval =
        loop.trigger === "hourly"
          ? 3600000
          : loop.trigger === "daily"
            ? 86400000
            : 604800000;
      if (
        !loop.lastRunAt ||
        now.getTime() - Date.parse(loop.lastRunAt) >= interval
      )
        this.runLoop(loop.id);
    }
  }
}
export function summarizeIssues(issues: Issue[], data: WorkspaceData): string {
  const progress = estimateProgress(issues);
  const unassigned = issues.filter(
    (i) =>
      !i.assignee &&
      CATEGORY[i.status] !== "completed" &&
      CATEGORY[i.status] !== "canceled",
  );
  return `${issues.length} issues · ${progress.completed} completed points / ${progress.scope} scope points\n${issues.filter((i) => CATEGORY[i.status] === "started").length} in progress · ${issues.filter((i) => i.status === "triage").length} in triage · ${unassigned.length} unassigned\n${
    issues
      .slice(0, 12)
      .map(
        (i) =>
          `${i.id} · ${i.title}${i.projectId ? ` — ${data.projects.find((p) => p.id === i.projectId)?.name ?? ""}` : ""}`,
      )
      .join("\n") || "No matching issues."
  }`;
}
export const LOOP_TEMPLATES = [
  {
    name: "Autofix bugs",
    description:
      "Investigates new bug reports and starts a coding session when it finds a clear fix",
    category: "Engineering",
    trigger: "triage",
    action: "coding-session",
  },
  {
    name: "Triage agent",
    description:
      "Reviews incoming issues, adds context, and routes each one to the right owner.",
    category: "Triage",
    trigger: "triage",
    action: "assign-owner",
  },
  {
    name: "Slack Q&A assistant",
    description:
      "Answers product questions from the team in a selected Slack channel.",
    category: "Support",
    trigger: "hourly",
    action: "slack-reply",
  },
  {
    name: "Weekly wrap",
    description:
      "Summarizes the week’s accomplishments for a person or team and shares the highlights.",
    category: "Reporting",
    trigger: "weekly",
    action: "summarize",
  },
  {
    name: "Feature request report",
    description:
      "Groups recent feature requests into a weekly report with themes and customer impact.",
    category: "Reporting",
    trigger: "weekly",
    action: "summarize",
  },
  {
    name: "Update issue priority based on demand",
    description:
      "Raises issue priority when duplicate reports or customer requests reach a chosen threshold.",
    category: "Triage",
    trigger: "daily",
    action: "raise-priority",
  },
  {
    name: "Project hygiene",
    description:
      "Reviews active projects for stale updates, missing details, and overdue work.",
    category: "Reporting",
    trigger: "weekly",
    action: "summarize",
  },
  {
    name: "Security alerts",
    description:
      "Alerts a Slack channel and sets an SLA whenever a security issue is reported.",
    category: "Security",
    trigger: "issue-updated",
    action: "slack-reply",
  },
] satisfies {
  name: string;
  description: string;
  category: string;
  trigger: Loop["trigger"];
  action: Loop["action"];
}[];

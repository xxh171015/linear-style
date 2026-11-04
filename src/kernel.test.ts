import { describe, expect, test } from "vitest";
import { CURRENT_USER, seedIssues, seedProjects, seedViews, TEAM_KEY } from "./data";
import {
  createKernel,
  explainViewFilter,
  ISSUE_GROUPINGS,
  ISSUE_STATUSES,
  PROJECT_STATUSES,
} from "./kernel";
import type { CustomView, Issue, IssueGrouping, Project, ProjectMilestone } from "./types";

const viewer = "Ada";
const teamKey = "XXH";

function issue(partial: Partial<Issue> & Pick<Issue, "id" | "title">): Issue {
  return {
    body: "",
    status: "todo",
    date: "",
    labels: [],
    priority: 0,
    subscribed: false,
    teamKey,
    ...partial,
  };
}

function project(partial: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    slugId: partial.slugId ?? partial.id,
    description: "",
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
    ...partial,
  };
}

function view(partial: Partial<CustomView> & Pick<CustomView, "id" | "name">): CustomView {
  return {
    slugId: partial.slugId ?? partial.id,
    description: "",
    modelName: "Issue",
    shared: false,
    owner: viewer,
    icon: "issues",
    grouping: "status",
    layout: "list",
    filter: {},
    ...partial,
  };
}

function kernelWith(
  issues: Issue[],
  extra?: { projects?: Project[]; views?: CustomView[]; milestones?: ProjectMilestone[] },
) {
  return createKernel({
    viewer,
    teamKey,
    issues,
    projects: extra?.projects,
    views: extra?.views,
    milestones: extra?.milestones,
  });
}

describe("Issue identifier and create defaults", () => {
  test("a new Issue receives the next unused identifier on the ambient Team", () => {
    const kernel = createKernel({ viewer, teamKey });
    expect(kernel.createIssue({ title: "First" }).id).toBe("XXH-1");
    expect(kernel.createIssue({ title: "Second" }).id).toBe("XXH-2");
  });

  test("identifier allocation continues after existing Issues", () => {
    const kernel = kernelWith([issue({ id: "XXH-12", title: "Existing" })]);
    expect(kernel.createIssue({ title: "Next" }).id).toBe("XXH-13");
  });

  test("a new Issue starts in backlog with Estimate absent and no Milestone", () => {
    const created = createKernel({ viewer, teamKey }).createIssue({ title: "Fresh" });
    expect(created.status).toBe("backlog");
    expect(created.estimate).toBeUndefined();
    expect(created.milestoneId).toBeUndefined();
    expect(created.creator).toBe(viewer);
    expect(created.assignee).toBeUndefined();
    expect(created.teamKey).toBe(teamKey);
  });

  test("a new Issue may start in a chosen Issue status", () => {
    const created = createKernel({ viewer, teamKey }).createIssue({ title: "Doing", status: "progress" });
    expect(created.status).toBe("progress");
  });
});

describe("Issue status and Estimate", () => {
  test("Issue status is only backlog, todo, progress, done, or canceled", () => {
    expect(ISSUE_STATUSES).toEqual(["backlog", "todo", "progress", "done", "canceled"]);
  });

  test("an Issue can change among the five statuses", () => {
    const kernel = createKernel({ viewer, teamKey });
    const created = kernel.createIssue({ title: "Move" });
    for (const status of ISSUE_STATUSES) {
      const result = kernel.updateIssue(created.id, { status });
      expect(result.ok).toBe(true);
      expect(kernel.getIssue(created.id)?.status).toBe(status);
    }
  });

  test("Estimate absent is unestimated, and an explicit 0 is zero points", () => {
    const kernel = createKernel({ viewer, teamKey });
    const absent = kernel.createIssue({ title: "Unestimated" });
    const zero = kernel.createIssue({ title: "Zero", estimate: 0 });
    expect(absent.estimate).toBeUndefined();
    expect(zero.estimate).toBe(0);
    const cleared = kernel.updateIssue(zero.id, { estimate: null });
    expect(cleared.ok).toBe(true);
    expect(kernel.getIssue(zero.id)?.estimate).toBeUndefined();
  });
});

describe("Built-in Issue lists", () => {
  test("Team Issues is every Issue on the ambient Team", () => {
    const kernel = kernelWith([
      issue({ id: "XXH-1", title: "Mine", assignee: viewer, creator: viewer }),
      issue({ id: "XXH-2", title: "Other", creator: "Bo" }),
    ]);
    expect(kernel.teamIssues().map((item) => item.id)).toEqual(["XXH-1", "XXH-2"]);
  });

  test("My Issues Assigned uses assignee name = viewer", () => {
    const kernel = kernelWith([
      issue({ id: "XXH-1", title: "Mine", assignee: viewer }),
      issue({ id: "XXH-2", title: "Theirs", assignee: "Bo" }),
      issue({ id: "XXH-3", title: "Nobody" }),
    ]);
    expect(kernel.myIssuesAssigned().map((item) => item.id)).toEqual(["XXH-1"]);
  });

  test("My Issues Created uses creator name = viewer", () => {
    const kernel = kernelWith([
      issue({ id: "XXH-1", title: "I opened", creator: viewer }),
      issue({ id: "XXH-2", title: "They opened", creator: "Bo" }),
    ]);
    expect(kernel.myIssuesCreated().map((item) => item.id)).toEqual(["XXH-1"]);
  });

  test("an Issue I created but did not assign to myself appears in Created and not in Assigned", () => {
    const kernel = createKernel({ viewer, teamKey });
    const created = kernel.createIssue({ title: "Opened by me" });
    expect(kernel.myIssuesCreated()).toEqual([created]);
    expect(kernel.myIssuesAssigned()).toEqual([]);
  });

  test("My Issues Subscribed uses the subscribed flag", () => {
    const kernel = kernelWith([
      issue({ id: "XXH-1", title: "Watching", subscribed: true }),
      issue({ id: "XXH-2", title: "Ignoring", subscribed: false }),
    ]);
    expect(kernel.myIssuesSubscribed().map((item) => item.id)).toEqual(["XXH-1"]);
  });

  test("the same Issue record is returned from My Issues and Team Issues", () => {
    const kernel = createKernel({ viewer, teamKey });
    const created = kernel.createIssue({ title: "Shared identity", assignee: viewer, subscribed: true });
    expect(kernel.teamIssues()[0]).toBe(created);
    expect(kernel.myIssuesAssigned()[0]).toBe(created);
    expect(kernel.myIssuesCreated()[0]).toBe(created);
    expect(kernel.myIssuesSubscribed()[0]).toBe(created);
    expect(kernel.getIssue(created.id)).toBe(created);
  });
});

describe("Parent Issue", () => {
  test("an Issue is not its own parent; the record is unchanged", () => {
    const kernel = createKernel({ viewer, teamKey });
    const created = kernel.createIssue({ title: "Self" });
    const result = kernel.updateIssue(created.id, { parentId: created.id });
    expect(result.ok).toBe(false);
    expect(kernel.getIssue(created.id)?.parentId).toBeUndefined();
  });

  test("create does not parent an Issue to the identifier it is about to receive", () => {
    const kernel = createKernel({ viewer, teamKey });
    const created = kernel.createIssue({ title: "Self", parentId: "XXH-1" });
    expect(created.id).toBe("XXH-1");
    expect(created.parentId).toBeUndefined();
  });

  test("a parent does not copy Project or Milestone onto children", () => {
    const kernel = kernelWith([], {
      projects: [project({ id: "atlas", name: "Atlas" })],
    });
    const parent = kernel.createIssue({
      title: "Parent",
      projectId: "atlas",
      milestoneId: "ms-1",
    });
    const child = kernel.createIssue({ title: "Child", parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
    expect(child.projectId).toBeUndefined();
    expect(child.milestoneId).toBeUndefined();
  });
});

describe("Grouping on built-in lists", () => {
  test("grouping words are status, priority, assignee, project, or none", () => {
    expect(ISSUE_GROUPINGS).toEqual(["status", "priority", "assignee", "project", "none"]);
  });

  test("grouping by status uses the five Issue statuses and omits empty groups", () => {
    const kernel = kernelWith([
      issue({ id: "XXH-1", title: "Todo", status: "todo" }),
      issue({ id: "XXH-2", title: "Done", status: "done" }),
    ]);
    expect(
      kernel.groupIssues(kernel.teamIssues(), "status").map((group) => ({
        key: group.key,
        ids: group.items.map((item) => item.id),
      })),
    ).toEqual([
      { key: "todo", ids: ["XXH-1"] },
      { key: "done", ids: ["XXH-2"] },
    ]);
  });

  test("grouping by priority orders Urgent, High, Medium, Low, then No priority", () => {
    const kernel = kernelWith([
      issue({ id: "XXH-1", title: "None", priority: 0 }),
      issue({ id: "XXH-2", title: "High", priority: 2 }),
      issue({ id: "XXH-3", title: "Urgent", priority: 1 }),
    ]);
    expect(kernel.groupIssues(kernel.teamIssues(), "priority").map((group) => group.label)).toEqual([
      "Urgent",
      "High",
      "No priority",
    ]);
  });

  test("grouping by assignee uses the assignee name or No assignee", () => {
    const kernel = kernelWith([
      issue({ id: "XXH-1", title: "Ada's", assignee: "Ada" }),
      issue({ id: "XXH-2", title: "Loose" }),
    ]);
    expect(kernel.groupIssues(kernel.teamIssues(), "assignee").map((group) => group.label)).toEqual([
      "Ada",
      "No assignee",
    ]);
  });

  test("grouping by project uses the Project name or No project", () => {
    const kernel = kernelWith(
      [issue({ id: "XXH-1", title: "In Atlas", projectId: "atlas" }), issue({ id: "XXH-2", title: "Loose" })],
      { projects: [project({ id: "atlas", name: "Atlas" })] },
    );
    expect(kernel.groupIssues(kernel.teamIssues(), "project").map((group) => group.label)).toEqual([
      "Atlas",
      "No project",
    ]);
  });

  test("grouping none returns a single unsectioned list", () => {
    const kernel = kernelWith([issue({ id: "XXH-1", title: "Only" })]);
    const groups = kernel.groupIssues(kernel.teamIssues(), "none");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("all");
    expect(groups[0]?.items).toEqual(kernel.teamIssues());
  });

  test("applying grouping to a built-in list does not persist a Custom View", () => {
    const kernel = kernelWith([issue({ id: "XXH-1", title: "Item", priority: 1 })], {
      views: [view({ id: "focus", name: "Focus", grouping: "status" })],
    });
    const stored = kernel.views()[0];
    kernel.groupIssues(kernel.teamIssues(), "priority");
    expect(kernel.views()).toEqual([stored]);
    expect(stored?.grouping).toBe("status");
  });

  test("every grouping word can be applied to Team Issues", () => {
    const kernel = kernelWith([issue({ id: "XXH-1", title: "Item" })]);
    for (const grouping of ISSUE_GROUPINGS satisfies readonly IssueGrouping[]) {
      expect(kernel.groupIssues(kernel.teamIssues(), grouping).length).toBeGreaterThan(0);
    }
  });
});

describe("Project Issues membership", () => {
  const atlas = project({ id: "atlas", name: "Atlas" });
  const helix = project({ id: "helix", name: "Helix" });

  test("Project Issues is the Issues whose Project is that Project", () => {
    const kernel = kernelWith(
      [
        issue({ id: "XXH-1", title: "In Atlas", projectId: "atlas" }),
        issue({ id: "XXH-2", title: "Loose" }),
        issue({ id: "XXH-3", title: "In Helix", projectId: "helix" }),
      ],
      { projects: [atlas, helix] },
    );
    expect(kernel.projectIssues("atlas").map((item) => item.id)).toEqual(["XXH-1"]);
    expect(kernel.teamIssues().map((item) => item.id)).toEqual(["XXH-1", "XXH-2", "XXH-3"]);
  });

  test("opening an Issue from Project Issues and from Team Issues is the same record", () => {
    const kernel = kernelWith([issue({ id: "XXH-1", title: "In Atlas", projectId: "atlas" })], {
      projects: [atlas],
    });
    const fromProject = kernel.projectIssues("atlas")[0];
    const fromTeam = kernel.teamIssues()[0];
    expect(fromProject).toBe(fromTeam);
    expect(fromProject).toBe(kernel.getIssue("XXH-1"));
  });

  test("a new Project is identified by a slug and starts in backlog with empty planning fields", () => {
    const created = createKernel({ viewer, teamKey }).createProject({ name: "Atlas" });
    expect(created.slugId).toBe("atlas");
    expect(created.id).toBe("atlas");
    expect(created.status).toBe("backlog");
    expect(created.lead).toBeUndefined();
    expect(created.startDate).toBeUndefined();
    expect(created.targetDate).toBeUndefined();
    expect(created.updates).toEqual([]);
    expect(created).not.toHaveProperty("health");
  });

  test("Project status is only backlog, planned, started, paused, completed, or canceled", () => {
    expect(PROJECT_STATUSES).toEqual(["backlog", "planned", "started", "paused", "completed", "canceled"]);
  });

  test("an Issue belongs to at most one Project, and any Team Issue may join", () => {
    const kernel = kernelWith([issue({ id: "XXH-1", title: "Move me" })], { projects: [atlas, helix] });
    expect(kernel.updateIssue("XXH-1", { projectId: "atlas" }).ok).toBe(true);
    expect(kernel.projectIssues("atlas").map((item) => item.id)).toEqual(["XXH-1"]);
    expect(kernel.updateIssue("XXH-1", { projectId: "helix" }).ok).toBe(true);
    expect(kernel.getIssue("XXH-1")?.projectId).toBe("helix");
    expect(kernel.projectIssues("atlas")).toEqual([]);
    expect(kernel.updateIssue("XXH-1", { projectId: null }).ok).toBe(true);
    expect(kernel.getIssue("XXH-1")?.projectId).toBeUndefined();
  });

  test("creating an Issue from a Project defaults that Project; lists do not force one", () => {
    const kernel = kernelWith([], { projects: [atlas] });
    const fromProject = kernel.createIssue({ title: "From project", projectId: "atlas" });
    const fromList = kernel.createIssue({ title: "From list" });
    expect(fromProject.projectId).toBe("atlas");
    expect(fromList.projectId).toBeUndefined();
    expect(kernel.projectIssues("atlas")).toEqual([fromProject]);
  });

  test("Project Issues is not stored as a Custom View", () => {
    const kernel = kernelWith([issue({ id: "XXH-1", title: "In Atlas", projectId: "atlas" })], {
      projects: [atlas],
      views: [view({ id: "atlas-query", name: "Atlas query", filter: { projectId: "atlas" } })],
    });
    expect(kernel.projectIssues("atlas").map((item) => item.id)).toEqual(["XXH-1"]);
    expect(kernel.views()).toHaveLength(1);
    expect(kernel.views()[0]?.id).toBe("atlas-query");
    expect(kernel.getProject("atlas")?.id).not.toBe(kernel.views()[0]?.id);
  });
});

describe("Project progress and health", () => {
  const atlas = project({ id: "atlas", name: "Atlas" });

  test("empty live scope is 0 progress, not 100%", () => {
    const kernel = kernelWith([], { projects: [atlas] });
    expect(kernel.projectProgress("atlas").ratio).toBe(0);
  });

  test("all live Issues done is 100% and all in progress is 25%", () => {
    const done = kernelWith(
      [issue({ id: "XXH-1", title: "Done", status: "done", projectId: "atlas", estimate: 2 })],
      { projects: [atlas] },
    );
    expect(done.projectProgress("atlas").ratio).toBe(1);
    const started = kernelWith(
      [issue({ id: "XXH-1", title: "Doing", status: "progress", projectId: "atlas" })],
      { projects: [atlas] },
    );
    expect(started.projectProgress("atlas").ratio).toBe(0.25);
  });

  test("unestimated live work counts as 1 point and explicit 0 counts as 0; canceled is out of live scope", () => {
    const kernel = kernelWith(
      [
        issue({ id: "XXH-1", title: "Done big", status: "done", projectId: "atlas", estimate: 3 }),
        issue({ id: "XXH-2", title: "Unestimated todo", status: "todo", projectId: "atlas" }),
        issue({ id: "XXH-3", title: "Zero", status: "todo", projectId: "atlas", estimate: 0 }),
        issue({ id: "XXH-4", title: "Canceled", status: "canceled", projectId: "atlas", estimate: 8 }),
      ],
      { projects: [atlas] },
    );
    const progress = kernel.projectProgress("atlas");
    expect(progress.scope).toBe(4);
    expect(progress.completed).toBe(3);
    expect(progress.ratio).toBe(0.75);
  });

  test("progress is the formula with no 99% cap", () => {
    const kernel = kernelWith(
      [
        issue({ id: "XXH-1", title: "Almost", status: "done", projectId: "atlas", estimate: 99 }),
        issue({ id: "XXH-2", title: "Last", status: "todo", projectId: "atlas", estimate: 1 }),
      ],
      { projects: [atlas] },
    );
    expect(kernel.projectProgress("atlas").ratio).toBe(0.99);
  });

  test("Milestone progress uses Estimate points, not completed counts, and empty is 0", () => {
    const kernel = createKernel({
      viewer,
      teamKey,
      projects: [atlas],
      milestones: [{ id: "ms-1", projectId: "atlas", name: "Ship", sortOrder: 1 }],
      issues: [
        issue({ id: "XXH-1", title: "Done", status: "done", projectId: "atlas", milestoneId: "ms-1", estimate: 3 }),
        issue({ id: "XXH-2", title: "Todo", status: "todo", projectId: "atlas", milestoneId: "ms-1", estimate: 1 }),
      ],
    });
    expect(kernel.milestoneProgress("ms-1").ratio).toBe(0.75);
    expect(kernel.milestoneProgress("missing").ratio).toBe(0);
  });

  test("no Project updates means no health; latest update wins; progress and health can disagree", () => {
    const kernel = kernelWith(
      [issue({ id: "XXH-1", title: "Done", status: "done", projectId: "atlas" })],
      { projects: [atlas] },
    );
    expect(kernel.projectHealth("atlas")).toBeUndefined();
    expect(kernel.projectProgress("atlas").ratio).toBe(1);
    kernel.addProjectUpdate("atlas", { health: "atRisk", body: "Slip" });
    expect(kernel.projectHealth("atlas")).toBe("atRisk");
    kernel.addProjectUpdate("atlas", { health: "offTrack", body: "Worse" });
    expect(kernel.projectHealth("atlas")).toBe("offTrack");
    expect(kernel.projectProgress("atlas").ratio).toBe(1);
    expect(kernel.getProject("atlas")).not.toHaveProperty("health");
  });

  test("a leftover stored health field does not win over the latest Project update", () => {
    const drifted = Object.assign(
      project({
        id: "atlas",
        name: "Atlas",
        updates: [{ id: "u1", health: "atRisk", body: "Slip", author: viewer, time: "now" }],
      }),
      { health: "onTrack" },
    );
    const kernel = kernelWith([], { projects: [drifted] });
    expect(kernel.projectHealth("atlas")).toBe("atRisk");
    expect(kernel.getProject("atlas")).not.toHaveProperty("health");
  });
});

describe("Custom View saved query", () => {
  const atlas = project({ id: "atlas", name: "Atlas" });
  const catalog = [
    issue({ id: "XXH-1", title: "Ada todo Focus", assignee: viewer, creator: viewer, status: "todo", labels: ["Focus"], projectId: "atlas", priority: 2, subscribed: true }),
    issue({ id: "XXH-2", title: "Bo done Debt", assignee: "Bo", creator: "Bo", status: "done", labels: ["Debt"], priority: 0 }),
    issue({ id: "XXH-3", title: "Ada progress", assignee: viewer, creator: "Bo", status: "progress", labels: ["Focus", "Debt"], subscribed: false, priority: 1 }),
  ];

  test("an empty filter matches every Team Issue", () => {
    const kernel = kernelWith(catalog, { views: [view({ id: "all", name: "All" })] });
    expect(kernel.customViewIssues("all").map((item) => item.id)).toEqual(["XXH-1", "XXH-2", "XXH-3"]);
  });

  test("assigned, created, and subscribed use the same predicates as My Issues", () => {
    const kernel = kernelWith(catalog, {
      views: [
        view({ id: "assigned", name: "Assigned", filter: { assignedToMe: true } }),
        view({ id: "created", name: "Created", filter: { createdByMe: true } }),
        view({ id: "watching", name: "Watching", filter: { subscribed: true } }),
      ],
    });
    expect(kernel.customViewIssues("assigned")).toEqual(kernel.myIssuesAssigned());
    expect(kernel.customViewIssues("created")).toEqual(kernel.myIssuesCreated());
    expect(kernel.customViewIssues("watching")).toEqual(kernel.myIssuesSubscribed());
  });

  test("statuses, project, labels, and priority each constrain membership", () => {
    const kernel = kernelWith(catalog, {
      projects: [atlas],
      views: [
        view({ id: "todo", name: "Todo", filter: { statuses: ["todo"] } }),
        view({ id: "atlas-issues", name: "Atlas issues", filter: { projectId: "atlas" } }),
        view({ id: "focus", name: "Focus", filter: { labels: ["Focus"] } }),
        view({ id: "none", name: "No priority", filter: { priority: 0 } }),
      ],
    });
    expect(kernel.customViewIssues("todo").map((item) => item.id)).toEqual(["XXH-1"]);
    expect(kernel.customViewIssues("atlas-issues").map((item) => item.id)).toEqual(["XXH-1"]);
    expect(kernel.customViewIssues("focus").map((item) => item.id)).toEqual(["XXH-1", "XXH-3"]);
    expect(kernel.customViewIssues("none").map((item) => item.id)).toEqual(["XXH-2"]);
  });

  test("filter fields AND together and unset fields do not constrain", () => {
    const kernel = kernelWith(catalog, {
      views: [
        view({
          id: "narrow",
          name: "Narrow",
          filter: { assignedToMe: true, statuses: ["todo", "progress"], labels: ["Focus"] },
        }),
      ],
    });
    expect(kernel.customViewIssues("narrow").map((item) => item.id)).toEqual(["XXH-1", "XXH-3"]);
  });

  test("Issues that match a Custom View are the same records as Team Issues", () => {
    const kernel = kernelWith(catalog, { views: [view({ id: "all", name: "All" })] });
    const fromView = kernel.customViewIssues("all")[0];
    expect(fromView).toBe(kernel.getIssue("XXH-1"));
    expect(fromView).toBe(kernel.teamIssues()[0]);
  });

  test("a Custom View whose filter names a Project remains a Custom View", () => {
    const kernel = kernelWith(catalog, {
      projects: [atlas],
      views: [view({ id: "atlas-query", name: "Atlas query", filter: { projectId: "atlas" } })],
    });
    expect(kernel.customViewIssues("atlas-query").map((item) => item.id)).toEqual(["XXH-1"]);
    expect(kernel.projectIssues("atlas").map((item) => item.id)).toEqual(["XXH-1"]);
    expect(kernel.getCustomView("atlas-query")?.id).not.toBe(kernel.getProject("atlas")?.id);
    expect(kernel.getCustomView("atlas-query")?.filter.projectId).toBe("atlas");
  });

  test("a View filter names a Project by slug as membership", () => {
    const helix = project({ id: "proj-1", slugId: "helix", name: "Helix" });
    const kernel = kernelWith(
      [issue({ id: "XXH-1", title: "In Helix", projectId: "proj-1" }), issue({ id: "XXH-2", title: "Loose" })],
      {
        projects: [helix],
        views: [view({ id: "helix-query", name: "Helix query", filter: { projectId: "helix" } })],
      },
    );
    expect(kernel.customViewIssues("helix-query").map((item) => item.id)).toEqual(["XXH-1"]);
    expect(kernel.customViewIssues("helix-query")).toEqual(kernel.projectIssues("helix"));
  });

  test("a new Custom View is Issue-only, slug-identified, private, with status grouping and list layout", () => {
    const created = createKernel({ viewer, teamKey }).createCustomView({ name: "Focus work" });
    expect(created.slugId).toBe("focus-work");
    expect(created.id).toBe("focus-work");
    expect(created.modelName).toBe("Issue");
    expect(created.owner).toBe(viewer);
    expect(created.shared).toBe(false);
    expect(created.grouping).toBe("status");
    expect(created.layout).toBe("list");
    expect(created.filter).toEqual({});
  });

  test("stored grouping and layout survive; grouping a built-in list does not rewrite them", () => {
    const kernel = createKernel({ viewer, teamKey });
    const created = kernel.createCustomView({ name: "Board", grouping: "priority", layout: "board" });
    kernel.groupIssues(kernel.teamIssues(), "assignee");
    expect(kernel.getCustomView(created.id)?.grouping).toBe("priority");
    expect(kernel.getCustomView(created.id)?.layout).toBe("board");
  });

  test("board layout is presentation-only: membership still follows the View filter", () => {
    const kernel = kernelWith(catalog, {
      views: [
        view({
          id: "board",
          name: "Board",
          layout: "board",
          grouping: "status",
          filter: { statuses: ["todo"] },
        }),
      ],
    });
    const members = kernel.customViewIssues("board");
    expect(members.map((item) => item.id)).toEqual(["XXH-1"]);
    expect(kernel.groupIssues(members, "status").map((group) => group.key)).toEqual(["todo"]);
  });

  test("a seeded board-layout Custom View has Issue membership for grouping columns", () => {
    const kernel = createKernel({
      viewer: CURRENT_USER,
      teamKey: TEAM_KEY,
      issues: seedIssues,
      projects: seedProjects,
      views: seedViews,
    });
    const boardViews = seedViews.filter((item) => item.layout === "board");
    const populated = boardViews.filter((item) => kernel.customViewIssues(item.id).length > 0);
    expect(populated.length).toBeGreaterThan(0);
    const board = populated[0]!;
    const groups = kernel.groupIssues(kernel.customViewIssues(board.id), board.grouping);
    expect(groups.some((group) => group.items.length > 0)).toBe(true);
  });

  test("a non-Issue View Model is not product and matches nothing", () => {
    const kernel = kernelWith(catalog, {
      views: [view({ id: "feed", name: "Feed", modelName: "FeedItem" })],
    });
    expect(kernel.customViewIssues("feed")).toEqual([]);
  });

  test("an unset View filter on an empty Team explains unconstrained emptiness", () => {
    expect(explainViewFilter({}, viewer, [])).toEqual({
      title: "The team has no issues",
      subline: "This view has no filter conditions.",
      lines: [],
    });
  });

  test("a constrained View filter explains each set condition when membership is empty", () => {
    const explanation = explainViewFilter(
      {
        assignedToMe: true,
        createdByMe: true,
        subscribed: true,
        statuses: ["todo", "progress"],
        projectId: "atlas",
        labels: ["Focus", "Debt"],
        priority: 2,
      },
      viewer,
      [atlas],
    );
    expect(explanation).toEqual({
      title: "No issues match this view",
      lines: [
        "Assigned to you",
        "Created by you",
        "Subscribed by you",
        "Status is Todo or In Progress",
        "Project is Atlas",
        "Label is Focus or Debt",
        "Priority is High",
      ],
    });
  });

  test("labels-only and statuses-only filters each produce one explanation line", () => {
    expect(explainViewFilter({ labels: ["Focus"] }, viewer, []).lines).toEqual(["Label is Focus"]);
    expect(explainViewFilter({ statuses: ["done"] }, viewer, []).lines).toEqual(["Status is Done"]);
  });

  test("a Project filter uses the Project name when present and the stored slug when missing", () => {
    expect(explainViewFilter({ projectId: "atlas" }, viewer, [atlas]).lines).toEqual([
      "Project is Atlas",
    ]);
    expect(explainViewFilter({ projectId: "gone-slug" }, viewer, [atlas]).lines).toEqual([
      "Project is gone-slug",
    ]);
  });

  test("priority zero is explained as No priority, distinct from an unset priority field", () => {
    expect(explainViewFilter({ priority: 0 }, viewer, []).lines).toEqual(["Priority is No priority"]);
    expect(explainViewFilter({}, viewer, []).lines).toEqual([]);
  });
});

describe("Milestone membership", () => {
  const atlas = project({ id: "atlas", name: "Atlas" });
  const helix = project({ id: "helix", name: "Helix" });
  const ship = { id: "ms-ship", projectId: "atlas", name: "Ship", sortOrder: 1 };
  const later = { id: "ms-later", projectId: "helix", name: "Later", sortOrder: 1 };

  test("setting a Milestone is allowed only when it belongs to the Issue’s Project", () => {
    const kernel = kernelWith([issue({ id: "XXH-1", title: "Work", projectId: "atlas" })], {
      projects: [atlas, helix],
      milestones: [ship, later],
    });
    expect(kernel.updateIssue("XXH-1", { milestoneId: "ms-ship" }).ok).toBe(true);
    expect(kernel.getIssue("XXH-1")?.milestoneId).toBe("ms-ship");
    const refused = kernel.updateIssue("XXH-1", { milestoneId: "ms-later" });
    expect(refused.ok).toBe(false);
    expect(kernel.getIssue("XXH-1")?.milestoneId).toBe("ms-ship");
  });

  test("setting a Milestone without a Project is refused and the record is unchanged", () => {
    const kernel = kernelWith([issue({ id: "XXH-1", title: "Loose" })], {
      projects: [atlas],
      milestones: [ship],
    });
    const refused = kernel.updateIssue("XXH-1", { milestoneId: "ms-ship" });
    expect(refused.ok).toBe(false);
    expect(kernel.getIssue("XXH-1")?.projectId).toBeUndefined();
    expect(kernel.getIssue("XXH-1")?.milestoneId).toBeUndefined();
  });

  test("leaving a Project clears the Milestone", () => {
    const kernel = kernelWith(
      [issue({ id: "XXH-1", title: "Work", projectId: "atlas", milestoneId: "ms-ship" })],
      { projects: [atlas], milestones: [ship] },
    );
    expect(kernel.updateIssue("XXH-1", { projectId: null }).ok).toBe(true);
    expect(kernel.getIssue("XXH-1")?.projectId).toBeUndefined();
    expect(kernel.getIssue("XXH-1")?.milestoneId).toBeUndefined();
  });

  test("a title change does not clear a Milestone", () => {
    const kernel = kernelWith(
      [issue({ id: "XXH-1", title: "Work", projectId: "atlas", milestoneId: "ms-ship" })],
      { projects: [atlas], milestones: [ship] },
    );
    expect(kernel.updateIssue("XXH-1", { title: "Renamed" }).ok).toBe(true);
    expect(kernel.getIssue("XXH-1")?.milestoneId).toBe("ms-ship");
  });

  test("moving an Issue to another Project clears a Milestone that belongs only to the old Project", () => {
    const kernel = kernelWith(
      [issue({ id: "XXH-1", title: "Work", projectId: "atlas", milestoneId: "ms-ship" })],
      { projects: [atlas, helix], milestones: [ship, later] },
    );
    expect(kernel.updateIssue("XXH-1", { projectId: "helix" }).ok).toBe(true);
    expect(kernel.getIssue("XXH-1")?.projectId).toBe("helix");
    expect(kernel.getIssue("XXH-1")?.milestoneId).toBeUndefined();
  });

  test("a parent Issue does not force children into the same Project or Milestone", () => {
    const kernel = kernelWith([], { projects: [atlas], milestones: [ship] });
    const parent = kernel.createIssue({ title: "Parent", projectId: "atlas", milestoneId: "ms-ship" });
    const child = kernel.createIssue({ title: "Child", parentId: parent.id });
    expect(parent.projectId).toBe("atlas");
    expect(parent.milestoneId).toBe("ms-ship");
    expect(child.parentId).toBe(parent.id);
    expect(child.projectId).toBeUndefined();
    expect(child.milestoneId).toBeUndefined();
  });

  test("create does not attach a Milestone that the Issue’s Project does not own", () => {
    const kernel = kernelWith([], { projects: [atlas], milestones: [ship] });
    const loose = kernel.createIssue({ title: "Loose", milestoneId: "ms-ship" });
    expect(loose.projectId).toBeUndefined();
    expect(loose.milestoneId).toBeUndefined();
  });
});

describe("Issue field updates", () => {
  test("assignee name, subscribed, Estimate, and parent can be updated", () => {
    const kernel = createKernel({ viewer, teamKey });
    const parent = kernel.createIssue({ title: "Parent" });
    const child = kernel.createIssue({ title: "Child" });
    expect(kernel.updateIssue(child.id, { assignee: viewer, subscribed: true, estimate: 2, parentId: parent.id }).ok).toBe(
      true,
    );
    const stored = kernel.getIssue(child.id);
    expect(stored?.assignee).toBe(viewer);
    expect(stored?.subscribed).toBe(true);
    expect(stored?.estimate).toBe(2);
    expect(stored?.parentId).toBe(parent.id);
  });
});


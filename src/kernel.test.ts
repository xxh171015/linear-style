import { describe, expect, test } from "vitest";
import { createKernel, ISSUE_GROUPINGS, ISSUE_STATUSES, PROJECT_STATUSES } from "./kernel";
import type { CustomView, Issue, IssueGrouping, Project } from "./types";

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

function kernelWith(issues: Issue[], extra?: { projects?: Project[]; views?: CustomView[] }) {
  return createKernel({ viewer, teamKey, issues, projects: extra?.projects, views: extra?.views });
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
    expect(created.health).toBeUndefined();
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


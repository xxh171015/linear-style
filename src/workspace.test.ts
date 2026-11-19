import { describe, expect, test } from "vitest";
import { createKernel, estimateProgress } from "./kernel";
import { localAgent } from "./adapters";
import { readRoute, routeHash } from "./router";
import {
  CATEGORY,
  DEFAULT_DISPLAY,
  Workspace,
  currentTeam,
  cyclePhase,
  displayIssues,
  initialData,
  initiativeProgress,
  matchesFilter,
  migrateData,
  pulseEntries,
  type Repository,
  type WorkspaceData,
} from "./workspace";
function fresh() {
  const data = initialData();
  data.issues = [];
  data.activity = [];
  data.inbox = [];
  data.loops = [];
  data.runs = [];
  return new Workspace(data);
}
describe("reference states and shared issue commands", () => {
  test("In Review shares a started category while Triage and Duplicate remain distinct named states", () => {
    expect(CATEGORY.review).toBe("started");
    expect(CATEGORY.duplicate).toBe("canceled");
    expect(CATEGORY.triage).toBe("triage");
  });
  test("a created issue has one identity in project, cycle and a saved query", () => {
    const w = fresh(),
      data = w.getSnapshot();
    const issue = w.createIssue({
      title: "Shared record",
      projectId: data.projects[0].id,
      cycleId: data.cycles[1].id,
      assignee: data.settings.user,
      subscribed: true,
    });
    w.updateIssue(issue.id, { status: "review" }, "in review");
    const saved = w.getSnapshot();
    const kernel = createKernel({ ...saved, viewer: saved.settings.user });
    expect(kernel.projectIssues(data.projects[0].id)[0].status).toBe("review");
    expect(
      saved.issues.filter((i) => i.cycleId === data.cycles[1].id)[0].id,
    ).toBe(issue.id);
    expect(kernel.myIssuesAssigned()[0].id).toBe(issue.id);
    expect(saved.inbox).toHaveLength(2);
  });
  test("blank titles and nonexistent cycles do not publish partial records", () => {
    const w = fresh();
    const before = w.getSnapshot();
    expect(() => w.createIssue({ title: " " })).toThrow();
    expect(() => w.createIssue({ title: "a", cycleId: "missing" })).toThrow();
    expect(w.getSnapshot()).toBe(before);
  });
  test("ancestor cycles are refused atomically", () => {
    const w = fresh();
    const a = w.createIssue({ title: "a" }),
      b = w.createIssue({ title: "b", parentId: a.id });
    const before = w.getSnapshot();
    expect(() => w.updateIssue(a.id, { parentId: b.id })).toThrow(/ancestor/);
    expect(w.getSnapshot()).toBe(before);
  });
  test("invalid milestone preserves all fields of a compound edit", () => {
    const w = fresh(),
      i = w.createIssue({ title: "a" });
    const before = w.getSnapshot();
    expect(() =>
      w.updateIssue(i.id, {
        title: "changed",
        milestoneId: before.milestones[0].id,
      }),
    ).toThrow();
    expect(w.getSnapshot()).toBe(before);
  });
  test("review counts as started, duplicates and triage are outside local live progress", () => {
    const w = fresh();
    const a = w.createIssue({ title: "review", status: "review", estimate: 4 }),
      b = w.createIssue({ title: "done", status: "done", estimate: 2 });
    w.createIssue({ title: "dup", status: "duplicate", estimate: 50 });
    w.createIssue({ title: "triage", status: "triage", estimate: 50 });
    expect(estimateProgress(w.getSnapshot().issues)).toEqual({
      scope: 6,
      started: 4,
      completed: 2,
      ratio: 0.5,
    });
    expect(a.id).not.toBe(b.id);
  });
});
describe("triage", () => {
  test("accepting preserves project and cycle and logs the transition", () => {
    const w = fresh(),
      d = w.getSnapshot();
    const i = w.createIssue({
      title: "incoming",
      status: "triage",
      projectId: d.projects[0].id,
      cycleId: d.cycles[1].id,
    });
    w.triage(i.id, "accept");
    expect(w.getSnapshot().issues[0]).toMatchObject({
      status: "backlog",
      projectId: d.projects[0].id,
      cycleId: d.cycles[1].id,
    });
    expect(w.getSnapshot().activity[0].text).toContain("accepted");
  });
  test("declining changes the named state without deleting the issue", () => {
    const w = fresh(),
      i = w.createIssue({ title: "incoming", status: "triage" });
    w.triage(i.id, "decline");
    expect(w.getSnapshot().issues[0].status).toBe("canceled");
  });
  test("marking a duplicate requires a different original", () => {
    const w = fresh(),
      a = w.createIssue({ title: "original" }),
      b = w.createIssue({ title: "incoming", status: "triage" });
    expect(() => w.triage(b.id, "duplicate", b.id)).toThrow();
    w.triage(b.id, "duplicate", a.id);
    expect(w.getSnapshot().issues.find((i) => i.id === b.id)).toMatchObject({
      status: "duplicate",
      duplicateOfId: a.id,
    });
  });
  test("duplicate chains cannot cycle", () => {
    const w = fresh(),
      a = w.createIssue({ title: "a" }),
      b = w.createIssue({ title: "b" });
    w.updateIssue(a.id, { duplicateOfId: b.id });
    expect(() => w.updateIssue(b.id, { duplicateOfId: a.id })).toThrow(/cycle/);
  });
  test("snooze retains triage and requires a future timestamp", () => {
    const w = fresh(),
      i = w.createIssue({ title: "incoming", status: "triage" });
    expect(() => w.triage(i.id, "snooze", "2000-01-01")).toThrow();
    const time = new Date(Date.now() + 86400000).toISOString();
    w.triage(i.id, "snooze", time);
    expect(w.getSnapshot().issues[0]).toMatchObject({
      status: "triage",
      snoozedUntil: time,
    });
  });
  test("a stale triage action is rejected", () => {
    const w = fresh(),
      i = w.createIssue({ title: "accepted", status: "todo" });
    expect(() => w.triage(i.id, "decline")).toThrow(/no longer/);
  });
});
describe("cycle and initiative selectors", () => {
  test("cycle dates classify current, upcoming, planned and completed", () => {
    const c = {
      id: "c",
      number: 1,
      name: "C",
      description: "",
      capacity: 8,
      startDate: "2026-11-16",
      endDate: "2026-11-22",
    };
    expect(cyclePhase(c, "2026-11-22")).toBe("Current");
    expect(cyclePhase(c, "2026-11-23")).toBe("Completed");
    expect(cyclePhase(c, "2026-11-10")).toBe("Upcoming");
    expect(cyclePhase(c, "2026-11-01")).toBe("Planned");
  });
  test("invalid date order and capacity cannot create a cycle", () => {
    const w = fresh();
    expect(() =>
      w.saveCycle({
        id: "x",
        name: "x",
        description: "",
        capacity: -1,
        startDate: "2026-11-20",
        endDate: "2026-11-10",
      }),
    ).toThrow();
  });
  test("initiative progress does not multiply an issue by the number of project links", () => {
    const w = fresh(),
      d = w.getSnapshot(),
      p = d.projects[0];
    w.mutate((next) => {
      next.projects[0].initiativeIds = ["target", "target"];
    });
    w.createIssue({
      title: "done",
      status: "done",
      projectId: p.id,
      estimate: 3,
    });
    expect(initiativeProgress(w.getSnapshot(), "target").scope).toBe(3);
  });
});
describe("query and display preferences", () => {
  test("compound filters retain AND and OR semantics and priority zero", () => {
    const w = fresh(),
      a = w.createIssue({ title: "alpha", priority: 0, status: "todo" }),
      b = w.createIssue({ title: "beta", priority: 2, status: "done" });
    expect(
      matchesFilter(
        a,
        {
          and: [{ query: "alpha" }, { priority: 0 }],
          or: [{ statuses: ["todo"] }, { statuses: ["review"] }],
        },
        "x",
      ),
    ).toBe(true);
    expect(matchesFilter(b, { priority: 0 }, "x")).toBe(false);
  });
  test("completed, triage and sub-issue display switches do not mutate membership", () => {
    const w = fresh(),
      parent = w.createIssue({ title: "parent" });
    w.createIssue({ title: "child", parentId: parent.id });
    w.createIssue({ title: "done", status: "done" });
    w.createIssue({ title: "triage", status: "triage" });
    const all = w.getSnapshot().issues;
    expect(
      displayIssues(all, {
        ...DEFAULT_DISPLAY,
        completed: "none",
        triage: false,
        subIssues: false,
      }).map((i) => i.id),
    ).toEqual([parent.id]);
    expect(all).toHaveLength(4);
  });
  test("priority ordering puts No priority last in ascending order", () => {
    const w = fresh();
    w.createIssue({ title: "none" });
    w.createIssue({ title: "high", priority: 2 });
    expect(
      displayIssues(w.getSnapshot().issues, {
        ...DEFAULT_DISPLAY,
        ordering: "priority",
        direction: "asc",
      }).map((i) => i.title),
    ).toEqual(["high", "none"]);
  });
  test("state-type grouping combines progress and review without losing identities", () => {
    const w = fresh();
    w.createIssue({ title: "progress", status: "progress" });
    w.createIssue({ title: "review", status: "review" });
    const k = createKernel(w.getSnapshot());
    expect(k.groupIssues(k.issues(), "status-type")[0].items).toHaveLength(2);
  });
});
describe("local adapters and automations", () => {
  test("Agent drafts are proposals and do not create issues", async () => {
    const w = fresh();
    const reply = await localAgent.reply(
      "Draft issue: Investigate latency",
      w.getSnapshot(),
    );
    expect(reply.draft?.title).toBe("Investigate latency");
    expect(w.getSnapshot().issues).toHaveLength(0);
  });
  test("Agent lookup and search return existing IDs only", async () => {
    const w = fresh(),
      i = w.createIssue({ title: "latency" });
    expect((await localAgent.reply(i.id, w.getSnapshot())).issueIds).toEqual([
      i.id,
    ]);
    expect(
      (await localAgent.reply("Find unavailable", w.getSnapshot())).issueIds,
    ).toEqual([]);
  });
  test("enabled triage trigger assigns an owner and records one run without recursion", () => {
    const w = fresh();
    w.mutate((d) =>
      d.loops.push({
        id: "loop",
        name: "Assign",
        prompt: "",
        category: "Triage",
        trigger: "triage",
        action: "assign-owner",
        enabled: true,
        assignee: "Ada",
      }),
    );
    const i = w.createIssue({ title: "incoming", status: "triage" });
    expect(w.getSnapshot().issues.find((x) => x.id === i.id)?.assignee).toBe(
      "Ada",
    );
    expect(w.getSnapshot().runs).toHaveLength(1);
  });
  test("external actions are limited and never report successful delivery", () => {
    const w = fresh();
    w.mutate((d) =>
      d.loops.push({
        id: "external",
        name: "Slack",
        prompt: "",
        category: "Support",
        trigger: "manual",
        action: "slack-reply",
        enabled: false,
      }),
    );
    const run = w.runLoop("external");
    expect(run.status).toBe("limited");
    expect(run.result).toContain("No message was sent");
  });
  test("unconnected IndexedDB mode sends no outbound GitHub, model, or coding calls", async () => {
    const original = globalThis.fetch;
    const outbound: string[] = [];
    globalThis.fetch = async (input, init) => {
      outbound.push(String(input));
      return original(input, init);
    };
    try {
      const w = fresh();
      w.mutate((d) => {
        d.reviews = [
          {
            id: "review",
            title: "Test",
            author: "Ada",
            approved: false,
            status: "review",
          },
        ];
        d.loops.push({
          id: "code",
          name: "Autofix",
          prompt: "",
          category: "Engineering",
          trigger: "manual",
          action: "coding-session",
          enabled: true,
        });
      });
      w.createIssue({ title: "offline coding" });
      w.transitionReview("review", "approve");
      const run = w.runLoop("code");
      expect(run.status).toBe("limited");
      expect(run.result).toContain("No session was started");
      await localAgent.reply("Draft issue: stay local", w.getSnapshot());
      expect(outbound).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });
  test("scheduled loops run once per interval while the app is active", () => {
    const w = fresh();
    w.mutate((d) =>
      d.loops.push({
        id: "scheduled",
        name: "Daily",
        prompt: "",
        category: "Reporting",
        trigger: "daily",
        action: "summarize",
        enabled: true,
      }),
    );
    w.tick();
    w.tick();
    expect(w.getSnapshot().runs).toHaveLength(1);
  });
  test("paused loops do not run on events", () => {
    const w = fresh();
    w.mutate((d) =>
      d.loops.push({
        id: "paused",
        name: "Paused",
        prompt: "",
        category: "Triage",
        trigger: "triage",
        action: "assign-owner",
        enabled: false,
      }),
    );
    w.createIssue({ title: "incoming", status: "triage" });
    expect(w.getSnapshot().runs).toHaveLength(0);
  });
});
describe("workspace storage and migration", () => {
  test("v1 migration preserves IDs, added properties and empty collections", () => {
    const raw = { ...initialData(), version: 1, issues: [], cycles: [] };
    const migrated = migrateData(raw);
    expect(migrated.version).toBe(2);
    expect(migrated.issues).toEqual([]);
    expect(migrated.cycles).toEqual([]);
  });
  test("unknown versions and corrupt records are rejected instead of reseeding", () => {
    expect(() => migrateData({ version: 99 })).toThrow();
    const d = initialData();
    d.issues[0].status = "invalid" as never;
    expect(() => migrateData(d)).toThrow();
  });
  test("duplicate IDs are rejected", () => {
    const d = initialData();
    d.issues.push(structuredClone(d.issues[0]));
    expect(() => migrateData(d)).toThrow(/duplicate ID/);
  });
  test("snapshots round trip attachments, drafts, chats, preferences and reads", async () => {
    let saved: WorkspaceData | undefined;
    const repository: Repository = {
      load: async () => saved,
      save: async (data) => {
        saved = structuredClone(data);
      },
    };
    const w = new Workspace(initialData(), repository);
    w.mutate((d) => {
      d.draft.title = "Keep draft";
      d.attachments.push({
        id: "f",
        ownerId: "draft",
        name: "a.txt",
        mime: "text/plain",
        size: 3,
        blob: new Blob(["abc"]),
      });
      d.preferences.list = { ...DEFAULT_DISPLAY, layout: "board" };
      d.inbox.forEach((i) => {
        i.read = true;
      });
    });
    await w.flushed();
    const restored = new Workspace(migrateData(await repository.load()));
    expect(restored.getSnapshot().draft.title).toBe("Keep draft");
    expect(await restored.getSnapshot().attachments[0].blob.text()).toBe("abc");
    expect(restored.getSnapshot().preferences.list.layout).toBe("board");
    expect(restored.getSnapshot().inbox.every((i) => i.read)).toBe(true);
  });
  test("save failures preserve edits and retry saves the newest revision", async () => {
    let fail = true;
    let saved: WorkspaceData | undefined;
    const repository: Repository = {
      load: async () => undefined,
      save: async (d) => {
        if (fail) throw Error("quota");
        saved = structuredClone(d);
      },
    };
    const w = new Workspace(initialData(), repository);
    w.createIssue({ title: "Keep me" });
    await w.flushed();
    expect(w.saveState).toBe("error");
    expect(w.getSnapshot().issues[0].title).toBe("Keep me");
    fail = false;
    w.retrySave();
    await w.flushed();
    expect(w.saveState).toBe("saved");
    expect(saved?.issues[0].title).toBe("Keep me");
  });
  test("serial saves cannot overwrite newer edits with an older snapshot", async () => {
    const revisions: number[] = [];
    const repository: Repository = {
      load: async () => undefined,
      save: async (d) => {
        await Promise.resolve();
        revisions.push(d.revision);
      },
    };
    const w = new Workspace(initialData(), repository);
    w.createIssue({ title: "first" });
    w.createIssue({ title: "second" });
    await w.flushed();
    expect(revisions).toEqual([1, 2]);
  });
});
describe("deep links", () => {
  test("routes round trip for every new entity and issue", () => {
    for (const route of [
      { nav: "cycles" as const, id: "current" },
      { nav: "projects" as const, id: "space name", section: "issues" },
      { nav: "agent" as const, id: "chat-1" },
      { nav: "loops" as const, id: "loop-1" },
    ])
      expect(readRoute(routeHash(route))).toEqual(route);
    expect(readRoute("#/issue/XXH-1").issueId).toBe("XXH-1");
  });
  test("old project links and malformed percent escapes are safe", () => {
    expect(readRoute("#/project/demo/activity")).toEqual({
      nav: "projects",
      id: "demo",
      section: "activity",
    });
    expect(readRoute("#/issue/%E0%A4")).toEqual({ nav: "my-issues" });
  });
});

describe("project query and constrained automation", () => {
  test("Project views filter their own object model", async () => {
    const { matchesProjectFilter } = await import("./workspace");
    const p = initialData().projects[0];
    expect(
      matchesProjectFilter(p, {
        statuses: ["started"],
        priority: p.priority,
        query: "研发",
      }),
    ).toBe(true);
    expect(matchesProjectFilter(p, { statuses: ["completed"] })).toBe(false);
  });
  test("local project proposals do not write until reviewed", async () => {
    const w = fresh();
    const count = w.getSnapshot().projects.length;
    const result = await localAgent.reply(
      "Create a new project: Latency",
      w.getSnapshot(),
    );
    expect(result.projectDraft?.name).toBe("Latency");
    expect(w.getSnapshot().projects.length).toBe(count);
  });
  test("priority loop acts only on originals meeting its duplicate threshold", () => {
    const w = fresh(),
      a = w.createIssue({ title: "Demand", status: "todo", priority: 4 }),
      b = w.createIssue({ title: "Other", status: "todo", priority: 4 });
    const d1 = w.createIssue({ title: "Report1", status: "triage" }),
      d2 = w.createIssue({ title: "Report2", status: "triage" });
    w.triage(d1.id, "duplicate", a.id);
    w.triage(d2.id, "duplicate", a.id);
    w.mutate((d) =>
      d.loops.push({
        id: "demand",
        name: "Demand",
        prompt: "",
        category: "Triage",
        trigger: "manual",
        action: "raise-priority",
        enabled: false,
        minimumDemand: 2,
      }),
    );
    w.runLoop("demand");
    expect(w.getSnapshot().issues.find((i) => i.id === a.id)?.priority).toBe(2);
    expect(w.getSnapshot().issues.find((i) => i.id === b.id)?.priority).toBe(4);
  });
  test("invalid calendar days are rejected rather than normalized", () => {
    const w = fresh();
    expect(() =>
      w.saveCycle({
        id: "bad",
        name: "Bad",
        startDate: "2026-02-31",
        endDate: "2026-03-07",
        capacity: 1,
        description: "",
      }),
    ).toThrow();
  });
  test("corrupt saved display preferences are rejected", () => {
    const raw = initialData();
    raw.preferences.bad = { ...DEFAULT_DISPLAY, properties: null as never };
    expect(() => migrateData(raw)).toThrow(/display/);
  });
});

describe("backup graph integrity", () => {
  test("corrupt imported parent cycles are rejected before replacement", () => {
    const raw = initialData();
    raw.issues[0].parentId = raw.issues[1].id;
    raw.issues[1].parentId = raw.issues[0].id;
    expect(() => migrateData(raw)).toThrow(/cycle/);
  });
  test("invalid imported membership does not get silently cleared", () => {
    const raw = initialData();
    raw.issues[0].projectId = "missing";
    expect(() => migrateData(raw)).toThrow(/missing project/);
  });
  test("importing an older document does not reset the transaction sequence", () => {
    const w = fresh();
    w.createIssue({ title: "one" });
    w.createIssue({ title: "two" });
    const revision = w.getSnapshot().revision;
    w.mutate((d) => {
      d.revision = 0;
    });
    expect(w.getSnapshot().revision).toBe(revision + 1);
  });
});

describe("offline review boundary", () => {
  test("review approval and local merge preserve linked issues and comments", () => {
    const w = fresh();
    w.mutate((d) => {
      d.reviews = [
        {
          id: "review",
          title: "Test",
          author: "Ada",
          approved: false,
          status: "review",
          issueIds: ["XXH-1"],
          comments: [
            { id: "comment", author: "Ada", body: "Keep this", time: "now" },
          ],
        },
      ];
    });
    w.transitionReview("review", "approve");
    expect(w.getSnapshot().reviews[0].status).toBe("ready");
    w.transitionReview("review", "merge");
    expect(w.getSnapshot().reviews[0]).toMatchObject({
      status: "merged",
      approved: true,
      issueIds: ["XXH-1"],
    });
    expect(w.getSnapshot().reviews[0].comments?.[0].body).toBe("Keep this");
  });
});

describe("project summary and description", () => {
  test("legacy summary text is preserved without mixing the two fields", () => {
    const raw = initialData();
    delete raw.projects[0].summary;
    raw.projects[0].description = "Legacy summary";
    const restored = migrateData(raw);
    expect(restored.projects[0].summary).toBe("Legacy summary");
    expect(restored.projects[0].description).toBe("");
    expect(raw.projects[0].description).toBe("Legacy summary");
  });
  test("current long descriptions survive migration separately", () => {
    const raw = initialData();
    raw.projects[0].summary = "Short";
    raw.projects[0].description = "# Goals\nLong description";
    const restored = migrateData(raw);
    expect(restored.projects[0].summary).toBe("Short");
    expect(restored.projects[0].description).toBe("# Goals\nLong description");
  });
});

describe("description recovery and comment conversations",()=>{
  test("description history retains the previous rich document and restoration is itself recoverable",()=>{
    const w=fresh(),issue=w.createIssue({title:"History",body:"**Original**"});
    w.updateIssue(issue.id,{body:"Replacement"},"updated the description");
    let snapshot=migrateData(w.getSnapshot());
    const version=snapshot.activity.find(a=>a.kind==="description")!;
    expect(version.body).toBe("**Original**");
    expect(snapshot.issues.find(i=>i.id===issue.id)?.body).toBe("Replacement");
    w.updateIssue(issue.id,{body:version.body},"restored the description");
    snapshot=migrateData(w.getSnapshot());
    expect(snapshot.issues.find(i=>i.id===issue.id)?.body).toBe("**Original**");
    expect(snapshot.activity.filter(a=>a.kind==="description").map(a=>a.body)).toEqual(["Replacement","**Original**"]);
  });
  test("own comments can be edited, replied to and recoverably deleted while enforcing ownership and thread scope",()=>{
    const w=fresh(),issue=w.createIssue({title:"Thread"}),other=w.createIssue({title:"Other"});
    w.comment(issue.id,"First **decision**");const root=w.getSnapshot().activity[0];
    w.comment(issue.id,"Follow-up",root.id);const reply=w.getSnapshot().activity[0];
    w.comment(issue.id,"Reply to follow-up",reply.id);
    expect(w.getSnapshot().activity[0].parentId).toBe(root.id);
    w.editComment(root.id,"Updated **decision**");
    expect(w.getSnapshot().activity.find(a=>a.id===root.id)?.editedAt).toBeTruthy();
    const before=w.getSnapshot();
    expect(()=>w.comment(other.id,"Wrong thread",root.id)).toThrow("no longer available");expect(w.getSnapshot()).toBe(before);
    w.setCommentDeleted(root.id,true);expect(w.getSnapshot().activity.find(a=>a.id===root.id)?.deletedAt).toBeTruthy();
    w.setCommentDeleted(root.id,false);expect(migrateData(w.getSnapshot()).activity.find(a=>a.id===root.id)).toMatchObject({body:"Updated **decision**"});
    w.mutate(d=>{d.settings.user="Someone else";});
    expect(()=>w.editComment(root.id,"Override")).toThrow("own comments");
    expect(()=>w.setCommentDeleted(root.id,true)).toThrow("own comments");
    expect(()=>migrateData({...w.getSnapshot(),activity:w.getSnapshot().activity.map(a=>a.id===root.id?{...a,parentId:reply.id}:a)})).toThrow("thread");
  });
});

describe("workspace documents",()=>{
  test("documents retain rich content, project links, attachments and recoverable deletion across backup restoration",()=>{
    const w=fresh(),project=w.getSnapshot().projects[0];
    const doc=w.createDocument("Decision log","**Decision**",project.id);
    w.updateDocument(doc.id,{body:"# Updated decision\n\nDetails"});
    w.setDocumentDeleted(doc.id,true);
    expect(()=>w.updateDocument(doc.id,{title:"Edit deleted"})).toThrow("Restore");
    w.setDocumentDeleted(doc.id,false);
    const restored=migrateData(w.getSnapshot()).documents[0];
    expect(restored).toMatchObject({id:doc.id,title:"Decision log",body:"# Updated decision\n\nDetails",projectId:project.id});
    expect(restored.deletedAt).toBeUndefined();
    const before=w.getSnapshot();expect(()=>w.createDocument("Bad","","missing")).toThrow("Project");expect(w.getSnapshot()).toBe(before);
    expect(()=>w.updateDocument(doc.id,{title:" "})).toThrow("title");
  });
  test("old backups gain an empty documents collection and corrupt references are rejected",()=>{
    const data=initialData();delete (data as Partial<WorkspaceData>).documents;
    expect(migrateData(data).documents).toEqual([]);
    const w=fresh();w.createDocument("Review");
    expect(()=>migrateData({...w.getSnapshot(),documents:w.getSnapshot().documents.map(doc=>({...doc,projectId:"missing"}))})).toThrow("document");
  });
});

describe("reactions and reusable issue templates",()=>{
  test("reactions toggle once per person and survive backup while deleted comments reject changes",()=>{
    const w=fresh(),issue=w.createIssue({title:"React"});w.comment(issue.id,"Decision");const comment=w.getSnapshot().activity[0];
    w.toggleReaction("issue",issue.id,"🎉");w.toggleReaction("comment",comment.id,"👍");
    expect(migrateData(w.getSnapshot()).activity.find(a=>a.id===comment.id)?.reactions).toEqual({"👍":[w.getSnapshot().settings.user]});
    w.toggleReaction("issue",issue.id,"🎉");expect(w.getSnapshot().issues.find(i=>i.id===issue.id)?.reactions).toEqual({});
    w.setCommentDeleted(comment.id,true);const before=w.getSnapshot();
    expect(()=>w.toggleReaction("comment",comment.id,"👍")).toThrow("no longer");expect(w.getSnapshot()).toBe(before);
    expect(()=>w.toggleReaction("issue",issue.id,"__proto__")).toThrow("reaction");
  });
  test("templates fill blank fields while preserving authored content and relationship context",()=>{
    const w=fresh(),issue=w.createIssue({title:"Existing"});
    const template=w.saveIssueTemplate("Investigation",{...w.getSnapshot().draft,title:"Template title",body:"## Questions",priority:2,labels:["Spike"]});
    w.mutate(d=>{d.draft.title="Authored title";d.draft.relation={issueId:issue.id,mode:"related"};d.draft.labels=["Focus"];});
    w.applyIssueTemplate(template);
    expect(w.getSnapshot().draft).toMatchObject({title:"Authored title",body:"## Questions",priority:2,labels:["Spike","Focus"],relation:{issueId:issue.id,mode:"related"}});
    expect(migrateData(w.getSnapshot()).templates[0].name).toBe("Investigation");
    w.setTemplateDeleted(template,true);expect(()=>w.applyIssueTemplate(template)).toThrow("not found");
    w.setTemplateDeleted(template,false);expect(()=>w.applyIssueTemplate(template)).not.toThrow();
  });
  test("template storage strips per-issue relationships and old backups gain an empty collection",()=>{
    const w=fresh();w.saveIssueTemplate("Safe",{...w.getSnapshot().draft,relation:{issueId:"XXH-1",mode:"related"}} as import("./types").IssueDraft);
    expect(w.getSnapshot().templates[0].fields).not.toHaveProperty("relation");
    const raw=w.getSnapshot();delete (raw as Partial<WorkspaceData>).templates;expect(migrateData(raw).templates).toEqual([]);
  });
});

describe("teams, labels, pulse and typed favorites", () => {
  test("legacy string favorites migrate and new teams allocate their own identifiers", () => {
    const migrated = migrateData({ ...initialData(), favorites: ["XXH-1"] } as unknown);
    expect(migrated.favorites).toEqual([{ id: "issue:XXH-1", kind: "issue", targetId: "XXH-1" }]);
    expect(migrated.teams[0].key).toBe("XXH");
    expect(migrated.labels.length).toBeGreaterThan(0);
    const w = fresh();
    w.createTeam({ key: "eng", name: "Engineering" });
    expect(currentTeam(w.getSnapshot()).key).toBe("ENG");
    expect(w.createIssue({ title: "From engineering" }).id).toBe("ENG-1");
    expect(w.createIssue({ title: "Still xxh", teamKey: "XXH" }).id).toBe("XXH-1");
    w.saveLabel({ name: "spike", color: "#5e6ad2" });
    w.toggleFavorite("issue", "ENG-1");
    expect(w.getSnapshot().labels.some((label) => label.name === "spike")).toBe(true);
    expect(w.getSnapshot().favorites).toEqual([{ id: "issue:ENG-1", kind: "issue", targetId: "ENG-1" }]);
    w.toggleFavorite("issue", "ENG-1");
    expect(w.getSnapshot().favorites).toEqual([]);
  });
  test("pulse lists project updates and issue activity, and filters can require a team or due date", () => {
    const data = initialData();
    expect(pulseEntries(data).length).toBeGreaterThan(0);
    const w = fresh();
    const issue = w.createIssue({ title: "Dated", dueDate: "2026-12-01", estimate: 2, labels: ["new-label"] });
    expect(w.getSnapshot().labels.some((label) => label.name === "new-label")).toBe(true);
    expect(matchesFilter(issue, { due: "set", estimate: "set", teamKey: "XXH" }, data.settings.user)).toBe(true);
    expect(matchesFilter(issue, { due: "unset" }, data.settings.user)).toBe(false);
    expect(readRoute("#/pulse")).toEqual({ nav: "pulse" });
  });
});

test("invalid template saves cannot poison the workspace and editing never revives a deleted template",()=>{
  const w=new Workspace(initialData()),fields=w.getSnapshot().draft;
  const before=w.getSnapshot();
  expect(()=>w.saveIssueTemplate("Invalid",{...fields,projectId:"missing"})).toThrow("template");
  expect(w.getSnapshot()).toBe(before);
  const id=w.saveIssueTemplate("Recoverable",fields);w.setTemplateDeleted(id,true);
  const deleted=w.getSnapshot();
  expect(()=>w.saveIssueTemplate("Changed",fields,id)).toThrow("Restore");expect(w.getSnapshot()).toBe(deleted);
  w.setTemplateDeleted(id,false);w.saveIssueTemplate("Changed",fields,id);
  expect(migrateData(w.getSnapshot()).templates[0].name).toBe("Changed");
});

test("team triage destinations and Accept rotation replace the hardcoded Backlog/Canceled path", () => {
  const w = fresh();
  w.updateTeam("XXH", { triageAcceptStatus: "todo", triageDeclineStatus: "duplicate", triageRotation: ["Ada", "Bea"] });
  const first = w.createIssue({ title: "one", status: "triage" });
  w.triage(first.id, "accept");
  expect(w.getSnapshot().issues.find((issue) => issue.id === first.id)).toMatchObject({ status: "todo", assignee: "Ada" });
  const second = w.createIssue({ title: "two", status: "triage" });
  w.triage(second.id, "accept");
  expect(w.getSnapshot().issues.find((issue) => issue.id === second.id)?.assignee).toBe("Bea");
  const third = w.createIssue({ title: "three", status: "triage" });
  w.triage(third.id, "decline");
  expect(w.getSnapshot().issues.find((issue) => issue.id === third.id)?.status).toBe("duplicate");
});

test("required template fields block create until filled, then stamp the draft template", () => {
  const w = fresh();
  const projectId = w.getSnapshot().projects[0].id;
  const id = w.saveIssueTemplate("Need project", { ...w.getSnapshot().draft, title: "From template" }, undefined, {
    required: ["project", "priority"],
  });
  w.applyIssueTemplate(id);
  expect(w.getSnapshot().draft.templateId).toBe(id);
  const before = w.getSnapshot();
  expect(() => w.createIssue(w.getSnapshot().draft)).toThrow(/project/);
  expect(w.getSnapshot()).toBe(before);
  w.mutate((d) => {
    d.draft.projectId = projectId;
    d.draft.priority = 2;
  });
  expect(w.createIssue(w.getSnapshot().draft).projectId).toBe(projectId);
});

test("a configured coding Loop enqueues a Confirmation instead of pretending to start", () => {
  const w = new Workspace(initialData(), undefined, {
    reviews: { transition: (review) => review },
    automations: {
      external: () => ({ status: "limited", message: "unused" }),
      codingConfigured: () => true,
      startCodingSession: (issueId) => ({ status: "completed", message: `started ${issueId}`, log: "ok" }),
    },
  });
  w.mutate((d) => {
    d.issues = [];
    d.inbox = [];
    d.loops = [{
      id: "code",
      name: "Autofix",
      prompt: "",
      category: "Engineering",
      trigger: "triage",
      action: "coding-session",
      enabled: true,
    }];
    d.runs = [];
  });
  const issue = w.createIssue({ title: "bug", status: "triage" });
  const run = w.getSnapshot().runs[0];
  expect(run.status).toBe("pending");
  const confirmation = w.getSnapshot().inbox.find((item) => item.kind === "confirmation");
  expect(confirmation?.confirmation).toMatchObject({ action: "coding-session", issueId: issue.id, loopRunId: run.id });
  w.dismissConfirmation(confirmation!.id);
  expect(w.getSnapshot().runs[0].status).toBe("failed");
  w.mutate((d) => {
    d.runs[0].status = "pending";
    delete d.inbox.find((item) => item.id === confirmation!.id)!.archivedAt;
  });
  w.confirmInbox(confirmation!.id);
  expect(w.getSnapshot().runs[0].status).toBe("completed");
  expect(w.getSnapshot().codingSessions[0].log).toBe("ok");
});

test("tick rolls a completed cycle and does not double-run a daily Loop", () => {
  const w = fresh();
  w.mutate((d) => {
    d.cycles = [{
      id: "c-ended",
      number: 1,
      name: "Cycle 1",
      startDate: "2026-11-09",
      endDate: "2026-11-15",
      capacity: 8,
      description: "",
      teamKey: "XXH",
    }];
    d.loops.push({
      id: "daily",
      name: "Daily",
      prompt: "",
      category: "Reporting",
      trigger: "daily",
      action: "summarize",
      enabled: true,
    });
  });
  const issue = w.createIssue({ title: "carry", cycleId: "c-ended", status: "review" });
  w.tick(new Date("2026-11-16T12:00:00"));
  expect(w.getSnapshot().issues.find((item) => item.id === issue.id)?.cycleId).not.toBe("c-ended");
  expect(w.getSnapshot().runs).toHaveLength(1);
  w.tick(new Date("2026-11-16T18:00:00"));
  expect(w.getSnapshot().runs).toHaveLength(1);
});

test("Team Cycle duration is 1–366 days and tick auto-creates adjacent Cycles until one covers today", () => {
  const w = fresh();
  expect(() => w.updateTeam("XXH", { cycleDurationDays: 0 })).toThrow(/1–366/);
  expect(() => w.updateTeam("XXH", { cycleDurationDays: 367 })).toThrow(/1–366/);
  expect(() => w.updateTeam("XXH", { cycleDurationDays: 1.5 })).toThrow(/1–366/);
  w.updateTeam("XXH", { cycleDurationDays: 1 });
  w.updateTeam("XXH", { cycleDurationDays: 366 });
  expect(w.getSnapshot().teams[0].cycleDurationDays).toBe(366);
  w.mutate((d) => {
    d.teams[0].cycleDurationDays = undefined;
    d.cycles = [{
      id: "c-ended",
      number: 1,
      name: "Cycle 1",
      startDate: "2026-11-02",
      endDate: "2026-11-08",
      capacity: 8,
      description: "",
      teamKey: "XXH",
    }];
  });
  w.tick(new Date("2026-11-19T12:00:00"));
  expect(
    w.getSnapshot().cycles.map((cycle) => [cycle.startDate, cycle.endDate]).sort(),
  ).toEqual([
    ["2026-11-02", "2026-11-08"],
    ["2026-11-09", "2026-11-15"],
    ["2026-11-16", "2026-11-22"],
  ]);
  w.updateTeam("XXH", { cycleDurationDays: 14 });
  w.mutate((d) => {
    d.cycles = [{
      id: "c-long",
      number: 1,
      name: "Cycle 1",
      startDate: "2026-10-19",
      endDate: "2026-11-01",
      capacity: 8,
      description: "",
      teamKey: "XXH",
    }];
  });
  w.tick(new Date("2026-11-16T12:00:00"));
  expect(
    w.getSnapshot().cycles.map((cycle) => [cycle.startDate, cycle.endDate]).sort(),
  ).toEqual([
    ["2026-10-19", "2026-11-01"],
    ["2026-11-02", "2026-11-15"],
    ["2026-11-16", "2026-11-29"],
  ]);
});

test("tick moves incomplete Issues including In Review onto the immediate successor, oldest completed Cycle first", () => {
  const w = fresh();
  w.mutate((d) => {
    d.cycles = [
      { id: "c1", number: 1, name: "Cycle 1", startDate: "2026-11-02", endDate: "2026-11-08", capacity: 8, description: "", teamKey: "XXH" },
      { id: "c2", number: 2, name: "Cycle 2", startDate: "2026-11-09", endDate: "2026-11-15", capacity: 8, description: "", teamKey: "XXH" },
    ];
  });
  const review = w.createIssue({ title: "review", cycleId: "c1", status: "review" });
  const todo = w.createIssue({ title: "todo", cycleId: "c2", status: "todo" });
  const done = w.createIssue({ title: "done", cycleId: "c1", status: "done" });
  const canceled = w.createIssue({ title: "canceled", cycleId: "c2", status: "canceled" });
  const duplicate = w.createIssue({ title: "duplicate", cycleId: "c1", status: "duplicate" });
  w.tick(new Date("2026-11-16T12:00:00"));
  const current = w.getSnapshot().cycles.find((cycle) => cycle.startDate === "2026-11-16" && cycle.endDate === "2026-11-22");
  expect(current).toBeTruthy();
  const issues = w.getSnapshot().issues;
  expect(issues.find((issue) => issue.id === review.id)?.cycleId).toBe(current!.id);
  expect(issues.find((issue) => issue.id === todo.id)?.cycleId).toBe(current!.id);
  expect(issues.find((issue) => issue.id === done.id)?.cycleId).toBe("c1");
  expect(issues.find((issue) => issue.id === canceled.id)?.cycleId).toBe("c2");
  expect(issues.find((issue) => issue.id === duplicate.id)?.cycleId).toBe("c1");
});

test("Accept with an empty rotation still writes the destination status", () => {
  const w = fresh();
  w.updateTeam("XXH", { triageAcceptStatus: "progress", triageRotation: [] });
  const issue = w.createIssue({ title: "keep owner", status: "triage", assignee: "Keep" });
  w.triage(issue.id, "accept");
  expect(w.getSnapshot().issues.find((item) => item.id === issue.id)).toMatchObject({
    status: "progress",
    assignee: "Keep",
  });
});

test("saving the Accept rotation list resets the rotation index", () => {
  const w = fresh();
  w.updateTeam("XXH", { triageRotation: ["Ada", "Bea"] });
  const first = w.createIssue({ title: "one", status: "triage" });
  w.triage(first.id, "accept");
  expect(w.getSnapshot().issues.find((issue) => issue.id === first.id)?.assignee).toBe("Ada");
  w.updateTeam("XXH", { triageRotation: ["Ada", "Bea"] });
  const second = w.createIssue({ title: "two", status: "triage" });
  w.triage(second.id, "accept");
  expect(w.getSnapshot().issues.find((issue) => issue.id === second.id)?.assignee).toBe("Ada");
});

test("a Template belongs to one Team or all Teams and apply only uses Templates for the current Team", () => {
  const w = fresh();
  const fields = { ...w.getSnapshot().draft, title: "From template" };
  w.createTeam({ key: "ENG", name: "Engineering" });
  const eng = w.saveIssueTemplate("Eng only", fields, undefined, { teamKey: "ENG" });
  w.setCurrentTeam("XXH");
  const xxh = w.saveIssueTemplate("Xxh only", fields, undefined, { teamKey: "XXH" });
  const all = w.saveIssueTemplate("All teams", fields);
  expect(w.getSnapshot().templates.find((template) => template.id === eng)?.teamKey).toBe("ENG");
  expect(w.getSnapshot().templates.find((template) => template.id === xxh)?.teamKey).toBe("XXH");
  expect(w.getSnapshot().templates.find((template) => template.id === all)?.teamKey).toBeUndefined();
  w.setCurrentTeam("ENG");
  w.applyIssueTemplate(eng);
  expect(w.getSnapshot().draft.templateId).toBe(eng);
  w.applyIssueTemplate(all);
  expect(w.getSnapshot().draft.templateId).toBe(all);
  const before = w.getSnapshot();
  expect(() => w.applyIssueTemplate(xxh)).toThrow(/current Team/);
  expect(w.getSnapshot()).toBe(before);
});

test("required assignee and status block create until filled", () => {
  const w = fresh();
  const assigneeId = w.saveIssueTemplate("Need assignee", { ...w.getSnapshot().draft, title: "Assigned" }, undefined, {
    required: ["assignee"],
  });
  const beforeAssignee = w.getSnapshot();
  expect(() => w.createIssue({ title: "Assigned", templateId: assigneeId })).toThrow(/assignee/);
  expect(w.getSnapshot()).toBe(beforeAssignee);
  expect(w.createIssue({ title: "Assigned", templateId: assigneeId, assignee: "Ada" }).assignee).toBe("Ada");
  const statusId = w.saveIssueTemplate("Need status", { ...w.getSnapshot().draft, title: "Stateful" }, undefined, {
    required: ["status"],
  });
  const beforeStatus = w.getSnapshot();
  expect(() => w.createIssue({ title: "Stateful", templateId: statusId })).toThrow(/status/);
  expect(w.getSnapshot()).toBe(beforeStatus);
  expect(w.createIssue({ title: "Stateful", templateId: statusId, status: "todo" }).status).toBe("todo");
});

test("a failed interval run retries after five minutes", () => {
  const w = fresh();
  const failedAt = new Date(2026, 10, 19, 10, 0, 0);
  w.mutate((d) => {
    d.loops.push({
      id: "daily",
      name: "Daily",
      prompt: "",
      category: "Reporting",
      trigger: "daily",
      action: "summarize",
      enabled: true,
    });
    d.runs.push({
      id: "r-fail",
      loopId: "daily",
      time: failedAt.toISOString(),
      status: "failed",
      result: "boom",
      issueIds: [],
      periodStart: "2026-11-19",
    });
  });
  w.tick(new Date(failedAt.getTime() + 60_000));
  expect(w.getSnapshot().runs).toHaveLength(1);
  w.tick(new Date(failedAt.getTime() + 6 * 60_000));
  expect(w.getSnapshot().runs).toHaveLength(2);
  expect(w.getSnapshot().runs[0].periodStart).toBe("2026-11-19");
});

test("event-triggered Loops do not re-run the same Issue activity", () => {
  const w = fresh();
  w.mutate((d) =>
    d.loops.push({
      id: "watch",
      name: "Watch",
      prompt: "",
      category: "Triage",
      trigger: "issue-updated",
      action: "summarize",
      enabled: true,
    }),
  );
  const issue = w.createIssue({ title: "live", status: "todo" });
  expect(w.getSnapshot().runs).toHaveLength(1);
  expect(w.getSnapshot().runs[0]).toMatchObject({ loopId: "watch", triggerIssueId: issue.id });
  const activityId = w.getSnapshot().runs[0].triggerActivityId;
  expect(activityId).toBeTruthy();
  w.updateIssue(issue.id, { priority: 2 });
  expect(w.getSnapshot().runs).toHaveLength(1);
  w.updateIssue(issue.id, { title: "renamed" }, "renamed");
  expect(w.getSnapshot().runs).toHaveLength(2);
  expect(w.getSnapshot().runs[0].triggerActivityId).not.toBe(activityId);
});

test("assign, raise-priority, and summarize Loops run without a Confirmation", () => {
  const w = fresh();
  w.mutate((d) => {
    d.loops.push(
      { id: "assign", name: "Assign", prompt: "", category: "Triage", trigger: "manual", action: "assign-owner", enabled: false, assignee: "Ada" },
      { id: "priority", name: "Priority", prompt: "", category: "Triage", trigger: "manual", action: "raise-priority", enabled: false, minimumDemand: 2 },
      { id: "summary", name: "Summary", prompt: "", category: "Reporting", trigger: "manual", action: "summarize", enabled: false },
    );
  });
  expect(w.runLoop("assign").status).toBe("completed");
  expect(w.runLoop("priority").status).toBe("completed");
  expect(w.runLoop("summary").status).toBe("completed");
  expect(w.getSnapshot().inbox.filter((item) => item.kind === "confirmation")).toHaveLength(0);
});

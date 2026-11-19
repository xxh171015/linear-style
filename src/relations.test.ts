import { describe, expect, test } from "vitest";
import {
  Workspace,
  initialData,
  migrateData,
  type WorkspaceData,
} from "./workspace";
import { openBlockers, relationsFor } from "./relations";
function fixture() {
  const data = initialData();
  data.issues = [];
  data.activity = [];
  data.inbox = [];
  const w = new Workspace(data);
  const a = w.createIssue({ title: "API", subscribed: true });
  const b = w.createIssue({ title: "Client", subscribed: true });
  const c = w.createIssue({ title: "Release" });
  return { w, a, b, c };
}
describe("issue relationships", () => {
  test("related links are symmetric, canonical and idempotent", () => {
    const { w, a, b } = fixture();
    const id = w.addRelation("issue", "related", a.id, b.id);
    const snapshot = w.getSnapshot();
    expect(w.addRelation("issue", "related", b.id, a.id)).toBe(id);
    expect(w.getSnapshot()).toBe(snapshot);
    expect(relationsFor(snapshot.relations, "issue", a.id)[0]).toMatchObject({
      otherId: b.id,
      label: "Related to",
    });
    expect(relationsFor(snapshot.relations, "issue", b.id)[0]).toMatchObject({
      otherId: a.id,
      label: "Related to",
    });
  });
  test("blocked-by and blocking are inverse views of a single edge", () => {
    const { w, a, b } = fixture();
    w.linkIssues(b.id, a.id, "blocked-by");
    const data = w.getSnapshot();
    expect(data.relations).toHaveLength(1);
    expect(relationsFor(data.relations, "issue", a.id)[0].label).toBe(
      "Blocking",
    );
    expect(relationsFor(data.relations, "issue", b.id)[0].label).toBe(
      "Blocked by",
    );
    expect(
      openBlockers(data.relations, b.id, data.issues).map((i) => i.id),
    ).toEqual([a.id]);
    w.updateIssue(a.id, { status: "done" });
    expect(
      openBlockers(w.getSnapshot().relations, b.id, w.getSnapshot().issues),
    ).toHaveLength(0);
    expect(w.getSnapshot().relations).toHaveLength(1);
    expect(w.getSnapshot().issues.find((i) => i.id === b.id)?.status).toBe(
      "backlog",
    );
  });
  test("self references, missing items and multi-hop cycles leave data unchanged", () => {
    const { w, a, b, c } = fixture();
    w.linkIssues(a.id, b.id, "blocking");
    w.linkIssues(b.id, c.id, "blocking");
    const before = w.getSnapshot();
    expect(() => w.linkIssues(c.id, a.id, "blocking")).toThrow("cycle");
    expect(() => w.linkIssues(a.id, a.id, "related")).toThrow("another");
    expect(() => w.addRelation("issue", "blocks", a.id, "missing")).toThrow(
      "unavailable",
    );
    expect(w.getSnapshot()).toBe(before);
  });
  test("parent and duplicate commands retain their own hierarchy constraints", () => {
    const { w, a, b, c } = fixture();
    w.linkIssues(a.id, b.id, "parent");
    w.linkIssues(c.id, b.id, "child");
    expect(w.getSnapshot().issues.find((i) => i.id === b.id)?.parentId).toBe(
      a.id,
    );
    expect(w.getSnapshot().issues.find((i) => i.id === c.id)?.parentId).toBe(
      b.id,
    );
    expect(() => w.linkIssues(a.id, c.id, "child")).toThrow("ancestor");
    w.linkIssues(c.id, a.id, "duplicate");
    expect(w.getSnapshot().issues.find((i) => i.id === c.id)).toMatchObject({
      status: "duplicate",
      duplicateOfId: a.id,
    });
    expect(() => w.linkIssues(a.id, c.id, "duplicate")).toThrow("cycle");
  });
  test("adding and removing links update both activity streams and subscribed inboxes", () => {
    const { w, a, b } = fixture();
    const before = w.getSnapshot().inbox.length;
    const id = w.addRelation("issue", "blocks", a.id, b.id);
    expect(w.getSnapshot().inbox.length).toBe(before + 2);
    expect(w.getSnapshot().activity.find((i) => i.issueId === a.id)?.text).toBe(
      `blocking ${b.id}`,
    );
    expect(w.getSnapshot().activity.find((i) => i.issueId === b.id)?.text).toBe(
      `blocked by ${a.id}`,
    );
    w.removeRelation(id);
    expect(w.getSnapshot().relations).toHaveLength(0);
    expect(w.getSnapshot().inbox.length).toBe(before + 4);
    const snapshot = w.getSnapshot();
    expect(() => w.removeRelation(id)).toThrow("not found");
    expect(w.getSnapshot()).toBe(snapshot);
  });
  test("backup restore preserves links and rejects dangling or duplicate edges", () => {
    const { w, a, b } = fixture();
    w.linkIssues(a.id, b.id, "related");
    const restored = migrateData(w.getSnapshot());
    expect(restored.relations).toHaveLength(1);
    const old = structuredClone(restored) as Partial<WorkspaceData>;
    delete old.relations;
    expect(migrateData(old).relations).toEqual([]);
    const invalid = structuredClone(restored);
    invalid.relations[0].targetId = "missing";
    expect(() => migrateData(invalid)).toThrow("unavailable");
    restored.relations.push({
      ...restored.relations[0],
      id: "duplicate",
      sourceId: b.id,
      targetId: a.id,
    });
    expect(() => migrateData(restored)).toThrow("already exists");
  });
  test("relationship persistence uses the same serialized repository as issue edits", async () => {
    const { w: aWorkspace, a, b } = fixture();
    let saved: WorkspaceData | undefined;
    const w = new Workspace(aWorkspace.getSnapshot(), {
      load: async () => saved,
      save: async (data) => {
        saved = structuredClone(data);
      },
    });
    w.linkIssues(a.id, b.id, "blocking");
    await w.flushed();
    const loaded = new Workspace(migrateData(saved));
    expect(
      relationsFor(loaded.getSnapshot().relations, "issue", b.id)[0].otherId,
    ).toBe(a.id);
  });
});

test("reopening a duplicate clears its canonical reference and survives restore", async () => {
  const { w, a, b } = fixture();
  w.linkIssues(b.id, a.id, "duplicate");
  w.updateIssue(b.id, { title: "Updated duplicate" });
  expect(w.getSnapshot().issues.find(i => i.id === b.id)?.duplicateOfId).toBe(a.id);
  w.updateIssue(b.id, { status: "backlog" }, "reopened issue");
  const restored = new Workspace(migrateData(w.getSnapshot()));
  expect(restored.getSnapshot().issues.find(i => i.id === b.id)?.status).toBe("backlog");
  expect(restored.getSnapshot().issues.find(i => i.id === b.id)?.duplicateOfId).toBeUndefined();
  expect(restored.getSnapshot().issues.find(i => i.id === a.id)?.status).toBe("backlog");
});

describe("create related issue", () => {
  test.each(["related", "blocking", "blocked-by"] as const)("%s is created atomically and appears on both ends", mode => {
    const {w,a} = fixture();
    const issue = w.createIssue({title:"Related work", relation:{issueId:a.id,mode}});
    const snapshot = w.getSnapshot();
    expect(snapshot.relations).toHaveLength(1);
    expect(relationsFor(snapshot.relations,"issue",a.id)[0]).toMatchObject({otherId:issue.id,label:mode === "related" ? "Related to" : mode === "blocking" ? "Blocking" : "Blocked by"});
    expect(relationsFor(snapshot.relations,"issue",issue.id)[0]).toMatchObject({otherId:a.id,label:mode === "related" ? "Related to" : mode === "blocking" ? "Blocked by" : "Blocking"});
    expect(snapshot.activity.find(event => event.issueId === a.id)?.text).toContain(issue.id);
    expect(snapshot.activity.find(event => event.issueId === issue.id)?.text).toContain(a.id);
    expect(migrateData(snapshot).relations).toEqual(snapshot.relations);
  });
  test("unavailable target cannot create an orphan or move draft attachments", () => {
    const {w} = fixture();
    w.mutate(data => {
      data.draft = {...data.draft, title:"Keep this", relation:{issueId:"missing",mode:"blocked-by"}};
      data.attachments.push({id:"file",ownerId:"draft",name:"keep.txt",mime:"text/plain",size:4,blob:new Blob(["keep"])});
    });
    const before = w.getSnapshot();
    expect(() => w.createIssue(before.draft,"draft")).toThrow("no longer available");
    expect(w.getSnapshot()).toBe(before);
    expect(migrateData(before).draft.relation).toEqual(before.draft.relation);
  });
  test("related creation and its draft recover through the repository", async () => {
    const {w:seed,a} = fixture(); let saved: WorkspaceData | undefined;
    const w = new Workspace(seed.getSnapshot(), {load:async()=>saved,save:async value=>{saved=structuredClone(value);}});
    w.mutate(d=>{d.draft={...d.draft,title:"Blocking follow-up",relation:{issueId:a.id,mode:"blocked-by"}};});
    await w.flushed();
    const loaded = new Workspace(migrateData(saved));
    const created = loaded.createIssue(loaded.getSnapshot().draft);
    expect(openBlockers(loaded.getSnapshot().relations,a.id,loaded.getSnapshot().issues).map(i=>i.id)).toEqual([created.id]);
    expect(() => migrateData({...loaded.getSnapshot(),draft:{...loaded.getSnapshot().draft,relation:{issueId:a.id,mode:"invalid"}}})).toThrow("draft relationship");
  });
});


describe("create parent and sub-issue", () => {
  test.each(["parent", "child"] as const)("%s updates the hierarchy and both activity streams in one snapshot", mode => {
    const {w,a} = fixture();
    const created = w.createIssue({title:"Hierarchy follow-up",relation:{issueId:a.id,mode}});
    const snapshot = w.getSnapshot();
    expect(snapshot.issues.find(i => i.id === (mode === "parent" ? created.id : a.id))?.parentId).toBe(mode === "parent" ? a.id : created.id);
    expect(snapshot.relations).toHaveLength(0);
    expect(snapshot.activity.find(i => i.issueId === a.id)?.text).toContain(created.id);
    expect(snapshot.activity.find(i => i.issueId === created.id)?.text).toContain(a.id);
    expect(migrateData(snapshot).issues).toEqual(snapshot.issues);
    expect(migrateData({...snapshot,draft:{...snapshot.draft,relation:{issueId:a.id,mode}}}).draft.relation?.mode).toBe(mode);
  });
  test("creating a parent inside its own descendants is rejected without moving attachments", () => {
    const {w,a,b} = fixture();
    w.updateIssue(b.id,{parentId:a.id});
    w.mutate(d => {d.attachments.push({id:"keep",ownerId:"draft",name:"keep.txt",mime:"text/plain",size:4,blob:new Blob(["keep"])});});
    const before = w.getSnapshot();
    expect(() => w.createIssue({title:"Invalid parent",parentId:b.id,relation:{issueId:a.id,mode:"child"}},"draft")).toThrow("ancestor");
    expect(w.getSnapshot()).toBe(before);
  });
  test("milestones are retained at creation and cannot refer to another project", () => {
    const {w} = fixture(); const milestone = w.getSnapshot().milestones[0];
    const created = w.createIssue({title:"Milestone work",projectId:milestone.projectId,milestoneId:milestone.id});
    expect(created.milestoneId).toBe(milestone.id);
    const before = w.getSnapshot();
    expect(() => w.createIssue({title:"Invalid milestone",milestoneId:milestone.id})).toThrow("selected project");
    expect(w.getSnapshot()).toBe(before);
  });
});

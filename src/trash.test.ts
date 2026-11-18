import { describe, expect, test } from "vitest";
import { initialData, migrateData, Workspace, type WorkspaceData } from "./workspace";
import { createKernel, estimateProgress } from "./kernel";
function fixture() {
  const data = initialData(); data.issues = []; data.inbox = []; data.activity = [];
  const w = new Workspace(data);
  const a = w.createIssue({ title: "Canonical", subscribed: true });
  const b = w.createIssue({ title: "Report", parentId: a.id, subscribed: true });
  w.linkIssues(a.id, b.id, "blocking");
  w.comment(a.id,"Keep this comment");
  return {w,a,b};
}
describe("recoverable issue deletion", () => {
  test("delete hides active queries but keeps issue, children, links and history for restoration", () => {
    const {w,a,b} = fixture();
    const before = w.getSnapshot();
    w.deleteIssue(a.id);
    const active = w.getActiveSnapshot();
    expect(w.getActiveSnapshot()).toBe(active);
    expect(active.issues.map(i=>i.id)).toEqual([b.id]);
    expect(estimateProgress(w.getSnapshot().issues).scope).toBe(1);
    expect(active.relations).toEqual([]);
    expect(active.activity.some(item=>item.issueId===a.id)).toBe(false);
    expect(active.inbox.some(item=>item.issueId===a.id)).toBe(false);
    expect(w.getSnapshot().issues.find(i=>i.id===a.id)?.deletedAt).toBeTruthy();
    expect(w.getSnapshot().relations).toEqual(before.relations);
    expect(w.getSnapshot().issues.find(i=>i.id===b.id)?.parentId).toBe(a.id);
    expect(createKernel(w.getSnapshot()).teamIssues().map(i=>i.id)).toEqual([b.id]);
    w.restoreIssue(a.id);
    expect(w.getActiveSnapshot().issues).toHaveLength(2);
    expect(w.getActiveSnapshot().relations).toEqual(before.relations);
    expect(w.getSnapshot().activity.some(event=>event.text.includes("Keep this comment"))).toBe(true);
    expect(w.getActiveSnapshot()).not.toBe(active);
  });
  test("trash survives repository reload with attachments and reserves task identifiers", async () => {
    const {w:seed,a,b} = fixture(); let saved: WorkspaceData | undefined;
    const w = new Workspace(seed.getSnapshot(),{load:async()=>saved,save:async d=>{saved=structuredClone(d);}});
    w.mutate(d=>d.attachments.push({id:"attachment",ownerId:b.id,name:"note.txt",size:4,mime:"text/plain",blob:new Blob(["note"])}));
    w.deleteIssue(b.id); await w.flushed();
    const loaded = new Workspace(migrateData(saved));
    expect(loaded.getActiveSnapshot().issues.map(i=>i.id)).toEqual([a.id]);
    const next = loaded.createIssue({title:"New task"});
    expect(next.id).not.toBe(b.id);
    loaded.restoreIssue(b.id);
    expect(loaded.getActiveSnapshot().issues.map(i=>i.id)).toContain(b.id);
    expect(loaded.getSnapshot().attachments[0].ownerId).toBe(b.id);
    expect(await loaded.getSnapshot().attachments[0].blob.text()).toBe("note");
  });
  test("trashed issues cannot be edited, commented, attached or used for new relations", () => {
    const {w,a,b} = fixture(); w.deleteIssue(a.id);
    const before = w.getSnapshot();
    expect(()=>w.updateIssue(a.id,{title:"Changed"})).toThrow("Restore");
    expect(()=>w.comment(a.id,"Changed")).toThrow("Restore");
    expect(()=>w.addAttachments(a.id,[])).toThrow("Restore");
    expect(()=>w.linkIssues(a.id,b.id,"related")).toThrow();
    expect(()=>w.addRelation("issue","blocks",a.id,b.id)).toThrow();
    expect(()=>w.createIssue({title:"Orphan",relation:{issueId:a.id,mode:"related"}})).toThrow("no longer available");
    expect(()=>w.createIssue({title:"Orphan",parentId:a.id})).toThrow("unavailable");
    expect(w.getSnapshot()).toBe(before);
    expect(()=>w.deleteIssue(a.id)).toThrow();
    expect(w.getSnapshot()).toBe(before);
    w.restoreIssue(a.id); const after = w.getSnapshot();
    expect(()=>w.restoreIssue(a.id)).toThrow(); expect(w.getSnapshot()).toBe(after);
  });
  test("automation ignores deleted issues and keeps their fields frozen", () => {
    const {w,a} = fixture();
    w.mutate(d=>{delete d.issues.find(i=>i.id===a.id)!.assignee; d.loops.push({id:"loop",name:"Assign",prompt:"",category:"Custom",enabled:true,trigger:"issue-updated",action:"assign-owner",assignee:"Owner"});});
    w.deleteIssue(a.id);
    w.runLoop("loop");
    expect(w.getSnapshot().issues.find(i=>i.id===a.id)?.assignee).toBeUndefined();
    expect(w.getSnapshot().runs[0].issueIds).not.toContain(a.id);
  });
  test("legacy backups remain readable and malformed deletion dates are rejected", () => {
    const {w,a} = fixture(); expect(migrateData(w.getSnapshot()).issues).toHaveLength(2);
    w.deleteIssue(a.id); const raw = structuredClone(w.getSnapshot());
    expect(migrateData(raw).issues.find(i=>i.id===a.id)?.deletedAt).toBeTruthy();
    raw.issues.find(i=>i.id===a.id)!.deletedAt="invalid";
    expect(()=>migrateData(raw)).toThrow("saved issue");
  });
});

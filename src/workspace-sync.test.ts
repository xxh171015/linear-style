import { beforeEach, describe, expect, test, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDBRepository, initialData, migrateData, Workspace } from "./workspace";
import { mergeWorkspace, WorkspaceConflict } from "./workspace-merge";
function seed() {
  const data=initialData();data.issues=data.issues.slice(0,2);data.relations=[];data.activity=[];data.inbox=[];
  for(const issue of data.issues){delete issue.parentId;delete issue.duplicateOfId;}
  return data;
}
beforeEach(()=>vi.stubGlobal("indexedDB",new IDBFactory()));
describe("shared workspace commits",()=>{
  test("two initial windows agree on one seed rather than overwriting defaults",async()=>{
    const a=new IndexedDBRepository(),b=new IndexedDBRepository();
    const first=seed(),second=seed();second.settings.workspace="Other seed";
    const values=await Promise.all([a.loadOrCreate(first),b.loadOrCreate(second)]);
    expect(values[0]).toEqual(values[1]);
  });
  test("simultaneous disjoint writes commit atomically without losing either edit",async()=>{
    const a=new IndexedDBRepository(),b=new IndexedDBRepository(),base=seed();await a.loadOrCreate(base);
    const ours=structuredClone(base),theirs=structuredClone(base);
    ours.issues[0].title="Window A title";ours.revision++;
    theirs.issues[1].priority=1;theirs.revision++;
    await Promise.all([a.commit(ours,base),b.commit(theirs,base)]);
    const shared=migrateData(await a.load());
    expect(shared.issues[0].title).toBe("Window A title");expect(shared.issues[1].priority).toBe(1);expect(shared.revision).toBe(2);
  });
  test("different fields of one issue merge, but competing field values are retained as conflicts",async()=>{
    const repository=new IndexedDBRepository(),base=seed();await repository.loadOrCreate(base);
    const ours=structuredClone(base),theirs=structuredClone(base);ours.issues[0].title="Local";theirs.issues[0].status="review";
    await repository.commit(theirs,base);await repository.commit(ours,base);
    const accepted=migrateData(await repository.load());expect(accepted.issues[0]).toMatchObject({title:"Local",status:"review"});
    const other=structuredClone(base);other.issues[0].title="Conflicting title";
    await expect(repository.commit(other,base)).rejects.toBeInstanceOf(WorkspaceConflict);
    expect(migrateData(await repository.load())).toEqual(accepted);
    await repository.commit(other,base,true);
    expect(migrateData(await repository.load()).issues[0]).toMatchObject({title:"Conflicting title",status:"review"});
  });
  test("concurrent creates sharing an identifier cannot overwrite either record, even by conflict override",async()=>{
    const base=seed(),a=new Workspace(base),b=new Workspace(base);
    const first=a.createIssue({title:"First new issue"}),second=b.createIssue({title:"Second new issue"});expect(first.id).toBe(second.id);
    const repository=new IndexedDBRepository();await repository.loadOrCreate(base);await repository.commit(a.getSnapshot(),base);
    await expect(repository.commit(b.getSnapshot(),base)).rejects.toThrow(first.id);
    await expect(repository.commit(b.getSnapshot(),base,true)).rejects.toThrow(first.id);
    expect(migrateData(await repository.load()).issues.find(issue=>issue.id===first.id)?.title).toBe("First new issue");
  });
  test("merge validation rejects combined blocking cycles without committing a partial graph",async()=>{
    const base=seed(),a=new Workspace(base),b=new Workspace(base),repository=new IndexedDBRepository();await repository.loadOrCreate(base);
    a.linkIssues(base.issues[0].id,base.issues[1].id,"blocking");b.linkIssues(base.issues[1].id,base.issues[0].id,"blocking");
    await repository.commit(a.getSnapshot(),base);const before=await repository.load();
    await expect(repository.commit(b.getSnapshot(),base)).rejects.toThrow("cycle");expect(await repository.load()).toEqual(before);
  });
  test("same-size replacement blobs are compared by content, not just metadata",async()=>{
    const base=seed();base.attachments=[{id:"file",ownerId:base.issues[0].id,name:"note.txt",size:4,mime:"text/plain",blob:new Blob(["base"])}];
    const ours=structuredClone(base),theirs=structuredClone(base);ours.attachments[0].blob=new Blob(["ours"]);theirs.attachments[0].blob=new Blob(["them"]);
    await expect(mergeWorkspace(base,ours,theirs)).rejects.toThrow("attachments.file.blob");
    const resolved=await mergeWorkspace(base,ours,theirs,true);expect(await resolved.attachments[0].blob.text()).toBe("ours");
  });
  test("queued local saves retain remote additions and a live refresh reaches the other window",async()=>{
    const aRepository=new IndexedDBRepository(),bRepository=new IndexedDBRepository();const base=seed();await aRepository.loadOrCreate(base);
    const a=new Workspace(base,aRepository),b=new Workspace(base,bRepository);
    try {
      a.updateIssue(base.issues[0].id,{title:"First title"});a.updateIssue(base.issues[0].id,{priority:1});
      b.updateIssue(base.issues[1].id,{title:"Other window"});
      await Promise.all([a.flushed(),b.flushed()]);await Promise.all([a.refreshShared(),b.refreshShared()]);
      for(const window of [a,b])expect(window.getSnapshot().issues).toEqual(migrateData(await aRepository.load()).issues);
      expect(a.getSnapshot().issues[0]).toMatchObject({title:"First title",priority:1});expect(a.getSnapshot().issues[1].title).toBe("Other window");
      a.updateIssue(base.issues[0].id,{body:"Remote broadcast"});await a.flushed();
      await vi.waitFor(()=>expect(b.getSnapshot().issues[0].body).toBe("Remote broadcast"));
    } finally {a.dispose();b.dispose();}
  });
  test("a conflicted window keeps its unsaved record until an explicit shared reload",async()=>{
    const repository=new IndexedDBRepository(),base=seed();await repository.loadOrCreate(base);
    const shared=new Workspace(base);shared.updateIssue(base.issues[0].id,{title:"Shared title"});await repository.commit(shared.getSnapshot(),base);
    const local=new Workspace(base,repository);
    try {
      local.updateIssue(base.issues[0].id,{title:"Unsaved local title"});await local.flushed();
      expect(local.saveConflict).toBe(true);expect(local.saveState).toBe("error");
      await local.refreshShared();expect(local.getSnapshot().issues[0].title).toBe("Unsaved local title");
      await local.useSharedChanges();expect(local.getSnapshot().issues[0].title).toBe("Shared title");expect(local.saveConflict).toBe(false);
    } finally {local.dispose();}
  });
});

test("sequential queued saves based on an older view do not delete a remotely added issue",async()=>{
  const base=seed(),repository=new IndexedDBRepository();await repository.loadOrCreate(base);
  const remote=new Workspace(base);const created=remote.createIssue({title:"Added in other window"});await repository.commit(remote.getSnapshot(),base);
  const local=new Workspace(base,repository);
  try {
    local.updateIssue(base.issues[0].id,{title:"Queued title"});local.updateIssue(base.issues[0].id,{body:"Queued body"});await local.flushed();
    const saved=migrateData(await repository.load());
    expect(saved.issues.find(issue=>issue.id===created.id)?.title).toBe("Added in other window");
    expect(saved.issues.find(issue=>issue.id===base.issues[0].id)).toMatchObject({title:"Queued title",body:"Queued body"});
    expect(local.saveState).toBe("saved");
  }finally{local.dispose();}
});

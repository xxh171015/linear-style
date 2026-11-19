// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { Workspace, initialData, migrateData } from "./workspace";
import { WorkspaceContext } from "./ui";
import { IssueComposer, IssueDetail } from "./issue-ui";

test("copy opens an independent, editable draft and saves without original history or relationships", () => {
  const w = new Workspace(initialData()), d = w.getSnapshot();
  const source = w.createIssue({title:"Source",body:"## Specification",status:"todo",priority:3,
    assignee:"Author",labels:["Focus"],projectId:d.projects[0].id,
    milestoneId:d.milestones.find(m=>m.projectId===d.projects[0].id)?.id,cycleId:d.cycles[0].id,subscribed:true});
  w.comment(source.id,"Original comment");
  w.toggleReaction("issue",source.id,"🎉");
  const original = structuredClone(w.getSnapshot().issues.find(i=>i.id===source.id));
  const count = w.getSnapshot().issues.length;
  w.prepareIssueCopy(source.id);
  expect(w.getSnapshot().issues).toHaveLength(count);
  const restored = migrateData(structuredClone(w.getSnapshot()));
  expect(restored.draft).toMatchObject({title:"Source (copy)",body:source.body,status:"todo",priority:3,
    assignee:"Author",labels:["Focus"],projectId:source.projectId,cycleId:source.cycleId});
  const copy = w.createIssue({...restored.draft,title:"Edited copy"});
  expect(copy.id).not.toBe(source.id);
  expect(copy.title).toBe("Edited copy");
  expect(copy.parentId).toBeUndefined();
  expect(copy.reactions).toBeUndefined();
  expect(copy.subscribed).toBe(false);
  expect(w.getSnapshot().activity.filter(a=>a.issueId===copy.id)).toHaveLength(1);
  expect(w.getSnapshot().issues.find(i=>i.id===source.id)).toEqual(original);
});

test("copy refuses unavailable sources and preserves an existing draft atomically", () => {
  const w = new Workspace(initialData()), id=w.getSnapshot().issues[0].id;
  w.mutate(d=>{d.draft.title="Unsubmitted work";});
  let before=w.getSnapshot();
  expect(()=>w.prepareIssueCopy(id)).toThrow(/current issue draft/);
  expect(w.getSnapshot()).toBe(before);
  expect(()=>w.prepareIssueCopy("missing")).toThrow(/Restore/);
  expect(w.getSnapshot()).toBe(before);
  w.deleteIssue(id); before=w.getSnapshot();
  expect(()=>w.prepareIssueCopy(id)).toThrow(/Restore/);
  expect(w.getSnapshot()).toBe(before);
});

test("detail copy action opens the composer, persists a draft and submits a new identity", async () => {
  Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",{value:true,configurable:true});
  const w=new Workspace(initialData()), id=w.getSnapshot().issues[0].id;
  const source=structuredClone(w.getSnapshot().issues[0]);
  const host=document.createElement("div"), root=createRoot(host); document.body.append(host);
  let opened=false, created="";
  await act(async()=>root.render(createElement(WorkspaceContext.Provider,{value:w},createElement(IssueDetail,{
    id,onClose:()=>{},onOpen:()=>{},onCreateChild:()=>{},onMakeCopy:()=>{opened=true;},
  }))));
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Issue options"]')!.click());
  await act(async()=>Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(b=>b.textContent==="Make a copy…")!.click());
  expect(opened).toBe(true);
  await act(async()=>root.render(createElement(WorkspaceContext.Provider,{value:w},createElement(IssueComposer,{
    onClose:()=>{},onCreated:value=>{created=value;},
  }))));
  expect(host.querySelector<HTMLInputElement>('[aria-label="Issue title"]')?.value).toBe(`${source.title} (copy)`);
  expect(host.querySelector('button[type="submit"]')?.textContent).toBe("Save copy");
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(created).not.toBe(id); expect(created).not.toBe("");
  expect(w.getSnapshot().draft.title).toBe("");
  expect(w.getSnapshot().issues.find(i=>i.id===id)).toEqual(source);
  await act(async()=>root.unmount()); host.remove();
});

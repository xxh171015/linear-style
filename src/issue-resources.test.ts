// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { Workspace, initialData, migrateData } from "./workspace";
import { normalizeResourceURL } from "./resource-links";
import { IssueLinkDialog, IssueResources } from "./issue-resources";
import { WorkspaceContext } from "./ui";

test("resource URLs normalize without fetching and reject executable, local and credential URLs",()=>{
  expect(normalizeResourceURL(" HTTPS://Example.com/path ")).toBe("https://example.com/path");
  for(const url of ["javascript:alert(1)","data:text/html,test","file:///tmp/test","https://user:password@example.com","example.com","https://exa mple.com"])
    expect(()=>normalizeResourceURL(url),url).toThrow(/valid/);
});
test("task links add, edit and remove one identity while preserving title, description and status",()=>{
  const w=new Workspace(initialData()),source=w.getSnapshot().issues[0];
  const id=w.saveIssueLink(source.id,{url:"https://example.com",title:"Specification"});
  let issue=w.getSnapshot().issues.find(i=>i.id===source.id)!;
  expect(issue.links).toEqual([{id,url:"https://example.com/",title:"Specification"}]);
  expect([issue.title,issue.body,issue.status]).toEqual([source.title,source.body,source.status]);
  w.saveIssueLink(source.id,{url:"https://example.com/revised",title:""},id);
  expect(w.getSnapshot().issues.find(i=>i.id===source.id)!.links![0]).toEqual({id,url:"https://example.com/revised",title:"https://example.com/revised"});
  w.removeIssueLink(source.id,id);
  issue=w.getSnapshot().issues.find(i=>i.id===source.id)!;expect(issue.links).toEqual([]);
  expect(w.getSnapshot().activity.filter(a=>a.issueId===source.id).slice(0,3).map(a=>a.text)).toEqual([
    "removed link https://example.com/revised","updated link https://example.com/revised","added link Specification",
  ]);
});
test("invalid references, duplicate URLs and stale edits never publish partial resource changes",()=>{
  const w=new Workspace(initialData()),id=w.getSnapshot().issues[0].id;
  const link=w.saveIssueLink(id,{url:"https://example.com",title:"Reference"});let before=w.getSnapshot();
  for(const action of [()=>w.saveIssueLink(id,{url:"javascript:alert(1)",title:""}),()=>w.saveIssueLink(id,{url:"https://example.com/",title:"Duplicate"}),()=>w.saveIssueLink(id,{url:"https://example.com/new",title:""},"gone")]) {
    expect(action).toThrow();expect(w.getSnapshot()).toBe(before);
  }
  w.deleteIssue(id);before=w.getSnapshot();
  expect(()=>w.removeIssueLink(id,link)).toThrow(/Restore/);expect(w.getSnapshot()).toBe(before);
  expect(()=>w.createIssueDocument(id)).toThrow(/Restore/);expect(w.getSnapshot()).toBe(before);
});
test("task documents have backlinks, move between issue and project, and restore ownership from backup",()=>{
  const w=new Workspace(initialData()),d=w.getSnapshot(),issue=d.issues[0];
  const doc=w.createIssueDocument(issue.id);
  expect(doc.issueId).toBe(issue.id);expect(doc.projectId).toBeUndefined();
  w.updateDocument(doc.id,{title:"Design notes",body:"## Details"});
  let restored=migrateData(structuredClone(w.getSnapshot()));
  expect(restored.documents.find(item=>item.id===doc.id)).toMatchObject({issueId:issue.id,title:"Design notes",body:"## Details"});
  w.updateDocument(doc.id,{projectId:d.projects[0].id});
  expect(w.getSnapshot().documents[0].issueId).toBeUndefined();
  w.updateDocument(doc.id,{issueId:issue.id});expect(w.getSnapshot().documents[0].projectId).toBeUndefined();
  w.setDocumentDeleted(doc.id,true);w.setDocumentDeleted(doc.id,false);
  restored=migrateData(structuredClone(w.getSnapshot()));expect(restored.documents[0].issueId).toBe(issue.id);
  const before=w.getSnapshot();
  expect(()=>w.updateDocument(doc.id,{issueId:"gone",title:"Should not change"})).toThrow();expect(w.getSnapshot()).toBe(before);
});
test("old backups work and malformed resource ownership or unsafe saved URLs are rejected",()=>{
  const d=initialData();expect(()=>migrateData(d)).not.toThrow();
  d.issues[0].links=[{id:"bad",url:"javascript:alert(1)",title:"bad"}];expect(()=>migrateData(d)).toThrow();
  delete d.issues[0].links;
  const w=new Workspace(d),doc=w.createIssueDocument(d.issues[0].id);
  const bad=structuredClone(w.getSnapshot());bad.documents.find(item=>item.id===doc.id)!.projectId=d.projects[0].id;
  expect(()=>migrateData(bad)).toThrow(/document/);
});
test("resource links and documents render as navigable resources, deleted documents disappear",async()=>{
  Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",{value:true,configurable:true});
  const w=new Workspace(initialData()),id=w.getSnapshot().issues[0].id;
  w.saveIssueLink(id,{url:"https://example.com",title:"Reference"});const doc=w.createIssueDocument(id);
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);
  await act(async()=>root.render(createElement(WorkspaceContext.Provider,{value:w},createElement(IssueResources,{id,onEdit:()=>{}}))));
  expect(host.querySelector('a[target="_blank"]')?.getAttribute("href")).toBe("https://example.com/");
  expect(host.querySelector(`a[href="#/documents/${doc.id}"]`)).not.toBeNull();
  await act(async()=>w.setDocumentDeleted(doc.id,true));expect(host.querySelector(`a[href="#/documents/${doc.id}"]`)).toBeNull();
  await act(async()=>w.setDocumentDeleted(doc.id,false));expect(host.querySelector(`a[href="#/documents/${doc.id}"]`)).not.toBeNull();
  await act(async()=>root.unmount());host.remove();
});
test("link form reports invalid input without closing or changing the task",async()=>{
  const w=new Workspace(initialData()),id=w.getSnapshot().issues[0].id;
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);let closed=false;
  await act(async()=>root.render(createElement(WorkspaceContext.Provider,{value:w},createElement(IssueLinkDialog,{issueId:id,onClose:()=>{closed=true;}}))));
  const input=host.querySelector<HTMLInputElement>('[aria-label="Resource URL"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"javascript:alert(1)");input.dispatchEvent(new Event("input",{bubbles:true}));});
  const before=w.getSnapshot();
  await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(closed).toBe(false);expect(host.querySelector('[role="alert"]')?.textContent).toContain("valid");expect(w.getSnapshot()).toBe(before);
  await act(async()=>root.unmount());host.remove();
});

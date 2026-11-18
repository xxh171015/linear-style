// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { WorkspaceContext } from "./ui";
import { IssueDetail } from "./issue-ui";
import { ArchivePage } from "./archive-ui";
import { initialData, Workspace } from "./workspace";

test("cancel is inert; confirmed deletion exposes read-only detail; archive restore reuses the same record", async () => {
  Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",{value:true,configurable:true});
  const data = initialData(); data.issues=[]; data.activity=[];
  const w = new Workspace(data), issue = w.createIssue({title:"Disposable local issue",body:"Retained description"});
  const host=document.createElement("div"); document.body.append(host); const root=createRoot(host);
  const detail=()=>createElement(WorkspaceContext.Provider,{value:w},createElement(IssueDetail,{id:issue.id,onClose:()=>{},onOpen:()=>{},onCreateChild:()=>{}}));
  const click=async(label:string, scope:Element=host)=>{const b=[...scope.querySelectorAll<HTMLButtonElement>("button")].find(b=>(b.getAttribute("aria-label")??b.textContent)===label);expect(b).toBeTruthy();await act(async()=>b!.click());};
  await act(async()=>root.render(detail()));
  await click("Issue options"); await click("Delete");
  const before=w.getSnapshot();
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain(issue.id);
  await click("Cancel",host.querySelector('[role="dialog"]')!); expect(w.getSnapshot()).toBe(before);
  await click("Issue options"); await click("Delete"); await click("Delete issue",host.querySelector('[role="dialog"]')!);
  expect(host.textContent).toContain("This issue was deleted");
  expect(host.querySelector('[aria-label="Issue title"]')).toBeNull();
  expect(host.textContent).toContain("Retained description");
  await act(async()=>root.render(createElement(WorkspaceContext.Provider,{value:w},createElement(ArchivePage,{route:{nav:"archive"},onIssue:()=>{},onCreate:()=>{}}))));
  expect(host.textContent).toContain("Disposable local issue"); await click("Restore");
  expect(host.textContent).toContain("No recently deleted issues");
  await act(async()=>root.render(detail()));
  expect(host.querySelector<HTMLInputElement>('[aria-label="Issue title"]')?.value).toBe(issue.title);
  expect(w.getSnapshot().issues.filter(i=>i.id===issue.id)).toHaveLength(1);
  await act(async()=>root.unmount());host.remove();
});

test("a pristine title follows shared updates and cannot blur-save an obsolete value",async()=>{
  const data=initialData(),workspace=new Workspace(data),id=data.issues[0].id;
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  await act(async()=>root.render(createElement(WorkspaceContext.Provider,{value:workspace},createElement(IssueDetail,{id,onClose:()=>{},onOpen:()=>{},onCreateChild:()=>{}}))));
  await act(async()=>workspace.updateIssue(id,{title:"Updated in another window",body:"Remote description",labels:["Shared label"]}));
  const input=host.querySelector<HTMLInputElement>('[aria-label="Issue title"]')!;
  expect(input.value).toBe("Updated in another window");
  expect(host.querySelector<HTMLInputElement>('[aria-label="Issue labels"]')?.value).toBe("Shared label");
  await act(async()=>input.dispatchEvent(new FocusEvent("focusout",{bubbles:true})));
  expect(workspace.getSnapshot().issues.find(issue=>issue.id===id)?.title).toBe("Updated in another window");
  const edit=[...host.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="Edit description")!;
  await act(async()=>edit.click());
  expect(host.querySelector('[aria-label="Edit issue description"]')?.textContent).toContain("Remote description");
  await act(async()=>root.unmount());host.remove();
});

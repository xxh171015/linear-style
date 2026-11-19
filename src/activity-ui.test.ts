// @vitest-environment jsdom
import { act,createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect,test } from "vitest";
import { WorkspaceContext } from "./context";
import { DescriptionHistory, IssueActivity } from "./activity-ui";
import { initialData,Workspace } from "./workspace";
Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",{value:true,configurable:true});
test("history preview can restore a prior description without deleting the replacement",async()=>{
  const w=new Workspace(initialData()),issue=w.createIssue({title:"History",body:"Earlier text"});
  w.updateIssue(issue.id,{body:"Later text"});
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);let closed=false;
  await act(async()=>root.render(createElement(WorkspaceContext.Provider,{value:w},createElement(DescriptionHistory,{id:issue.id,onClose:()=>{closed=true;}}))));
  await act(async()=>host.querySelectorAll<HTMLButtonElement>("nav button")[1].click());
  expect(host.querySelector('[aria-label="Version preview"]')?.textContent).toBe("Earlier text");
  const restore=[...host.querySelectorAll("button")].find(b=>b.textContent==="Restore this version")!;
  await act(async()=>restore.click());expect(closed).toBe(true);
  expect(w.getSnapshot().issues.find(i=>i.id===issue.id)?.body).toBe("Earlier text");
  expect(w.getSnapshot().activity.find(a=>a.kind==="description")?.body).toBe("Later text");
  await act(async()=>root.unmount());host.remove();
});
test("comment replies stay with their parent and deletion leaves a recoverable placeholder",async()=>{
  const w=new Workspace(initialData()),issue=w.createIssue({title:"Thread"});
  w.comment(issue.id,"Parent comment");const parent=w.getSnapshot().activity[0];w.comment(issue.id,"Reply body",parent.id);
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);
  await act(async()=>root.render(createElement(WorkspaceContext.Provider,{value:w},createElement(IssueActivity,{id:issue.id}))));
  expect(host.querySelector('[aria-label="Comment replies"]')?.textContent).toContain("Reply body");
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="Delete comment")!.click());
  expect(host.textContent).toContain("Comment deleted");expect(host.textContent).toContain("Reply body");
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="Undo delete")!.click());
  expect(host.textContent).toContain("Parent comment");expect(host.textContent).not.toContain("Comment deleted");
  await act(async()=>root.unmount());host.remove();
});

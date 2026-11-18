// @vitest-environment jsdom
import { expect, test } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceContext } from "./ui";
import { RelationPicker } from "./relation-ui";
import { IssueComposer, IssueDetail } from "./issue-ui";
import { initialData, Workspace } from "./workspace";

test("blocking relationships render in the properties rail, matching observed Linear QA", async () => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
  const data = initialData();
  data.issues = [];
  data.activity = [];
  const workspace = new Workspace(data);
  const a = workspace.createIssue({ title: "Replica QA A" }),
    b = workspace.createIssue({ title: "Replica QA B" });
  workspace.linkIssues(a.id, b.id, "blocking");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(
        WorkspaceContext.Provider,
        { value: workspace },
        createElement(IssueDetail, {
          id: b.id,
          onClose: () => {},
          onOpen: () => {},
          onCreateChild: () => {},
        }),
      ),
    ),
  );
  expect(
    host.querySelector("aside .r-issue-dependencies")?.textContent,
  ).toContain("Blocked by");
  expect(
    host.querySelector("aside .r-issue-dependencies")?.textContent,
  ).toContain("Replica QA A");
  expect(host.querySelector(".r-detail-body .r-relations")).toBeNull();
  await act(async () =>
    workspace.removeRelation(workspace.getSnapshot().relations[0].id),
  );
  expect(host.querySelector("aside .r-issue-dependencies")).toBeNull();
  await act(async () => root.unmount());
  host.remove();
});

test("completion only changes dependency presentation and reopening restores it", async () => {
  const data = initialData(); data.issues = []; data.activity = [];
  const workspace = new Workspace(data);
  const a = workspace.createIssue({title: "Blocker"}), b = workspace.createIssue({title: "Blocked"});
  workspace.linkIssues(a.id, b.id, "blocking");
  const host = document.createElement("div"), root = createRoot(host);
  document.body.append(host);
  await act(async () => root.render(createElement(WorkspaceContext.Provider, {value:workspace}, createElement(IssueDetail, {id:b.id,onClose:()=>{},onOpen:()=>{},onCreateChild:()=>{}}))));
  const edge = structuredClone(workspace.getSnapshot().relations);
  await act(async () => workspace.updateIssue(b.id,{status:"done"}));
  expect(host.querySelector("aside .r-issue-dependencies h3")?.textContent).toBe("Related");
  expect(workspace.getSnapshot().relations).toEqual(edge);
  await act(async () => workspace.updateIssue(b.id,{status:"backlog"}));
  expect(host.querySelector("aside .r-issue-dependencies h3")?.textContent).toBe("Blocked by");
  await act(async () => root.unmount()); host.remove();
});


test("duplicate selection requires confirmation; switch and cancel do not mutate; submit uses displayed direction", async () => {
  const data = initialData(); data.issues = []; data.activity = [];
  const workspace = new Workspace(data);
  const a = workspace.createIssue({title: "Original"}), b = workspace.createIssue({title:"Report"});
  const host = document.createElement("div"), root = createRoot(host); document.body.append(host);
  let closed = false;
  const render = async () => { await act(async () => root.render(createElement(WorkspaceContext.Provider, {value:workspace}, createElement(RelationPicker,{id:b.id,mode:"duplicate",onClose:()=>{closed=true;}})))); };
  const click = async (label: string) => { const button = [...host.querySelectorAll("button")].find(b => b.textContent === label)!; expect(button).toBeTruthy(); await act(async () => button.click()); };
  await render();
  const before = workspace.getSnapshot();
  await click("Mark as duplicate of");
  expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Mark as duplicate");
  expect(workspace.getSnapshot()).toBe(before);
  await click("Switch direction");
  expect(host.querySelector(".r-duplicate-card")?.textContent).toContain(a.id);
  expect(workspace.getSnapshot()).toBe(before);
  await click("Cancel"); expect(closed).toBe(true); expect(workspace.getSnapshot()).toBe(before);
  await act(async () => root.unmount());
  const root2 = createRoot(host);
  await act(async () => root2.render(createElement(WorkspaceContext.Provider,{value:workspace},createElement(RelationPicker,{id:b.id,mode:"duplicate",onClose:()=>{closed=true;}}))));
  await click("Mark as duplicate of"); await click("Switch direction"); await click("Mark as duplicate");
  expect(workspace.getSnapshot().issues.find(i => i.id === a.id)).toMatchObject({status:"duplicate",duplicateOfId:b.id});
  expect(workspace.getSnapshot().issues.find(i => i.id === b.id)?.status).toBe("backlog");
  await act(async () => root2.unmount()); host.remove();
});


test("Create related exposes all five creation directions without mutating the source issue", async () => {
  const workspace = new Workspace(initialData()), issue=workspace.getSnapshot().issues[0];
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);
  const picked: unknown[]=[];
  await act(async () => root.render(createElement(WorkspaceContext.Provider,{value:workspace},createElement(IssueDetail,{id:issue.id,onClose:()=>{},onOpen:()=>{},onCreateChild:()=>{},onCreateRelated:value=>picked.push(value)}))));
  const before=workspace.getSnapshot();
  const click=async(label:string) => {const b=[...host.querySelectorAll("button")].find(b=>b.textContent?.trim()===label || b.getAttribute("aria-label")===label)!;expect(b).toBeTruthy();await act(async()=>b.click());};
  for (const label of ["Issue…","Sub-issue…","Parent issue…","Blocked issue…","Blocking issue…"]) {
    await click("Issue options");await click("Create related");await click(label);
  }
  expect(picked).toEqual(["related","parent","child","blocking","blocked-by"].map(mode=>({issueId:issue.id,mode})));
  expect(workspace.getSnapshot()).toBe(before);
  await act(async()=>root.unmount());host.remove();
});

test("related composer inherits context, exposes the inverse direction, and can remove it before creation", async () => {
  const workspace=new Workspace(initialData());
  const milestone=workspace.getSnapshot().milestones[0],cycle=workspace.getSnapshot().cycles[0];
  const source=workspace.createIssue({title:"Source",status:"todo",priority:2,assignee:"Owner",projectId:milestone.projectId,milestoneId:milestone.id,cycleId:cycle.id,labels:["Focus"],body:"Existing text"});
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);
  await act(async()=>root.render(createElement(WorkspaceContext.Provider,{value:workspace},createElement(IssueComposer,{relation:{issueId:source.id,mode:"blocking"},onClose:()=>{},onCreated:()=>{}}))));
  expect(workspace.getSnapshot().draft).toMatchObject({title:"",body:"",status:"todo",priority:0,labels:[],assignee:"Owner",projectId:milestone.projectId,milestoneId:milestone.id,cycleId:cycle.id});
  expect(host.querySelector('[role="status"]')?.textContent).toContain(`Blocked by ${source.id}`);
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Remove draft relationship"]')!.click());
  expect(workspace.getSnapshot().draft.relation).toBeUndefined();
  await act(async()=>workspace.mutate(d=>{d.draft.title="Unlinked work";}));
  await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(workspace.getSnapshot().relations).toHaveLength(0);
  expect(workspace.getSnapshot().issues[0]).toMatchObject({title:"Unlinked work",milestoneId:milestone.id});
  await act(async()=>root.unmount());host.remove();
});


test("Create more keeps context and returns focus to the composer instead of the background title", async () => {
  const workspace=new Workspace(initialData()),source=workspace.getSnapshot().issues[0];
  const host=document.createElement("div");document.body.append(host);
  const background=document.createElement("input");background.setAttribute("aria-label","Issue title");host.append(background);
  const target=document.createElement("div");host.append(target);
  const composerRoot=createRoot(target);
  await act(async()=>composerRoot.render(createElement(WorkspaceContext.Provider,{value:workspace},createElement(IssueComposer,{relation:{issueId:source.id,mode:"blocking"},onClose:()=>{},onCreated:()=>{}}))));
  await act(async()=>target.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  for(const title of ["First blocked work","Second blocked work"]) {
    await act(async()=>workspace.mutate(d=>{d.draft.title=title;}));
    await act(async()=>target.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
    expect(document.activeElement).toBe(target.querySelector('[aria-label="Issue title"]'));
    expect(workspace.getSnapshot().draft.title).toBe("");
    expect(workspace.getSnapshot().draft.relation).toEqual({issueId:source.id,mode:"blocking"});
  }
  expect(workspace.getSnapshot().relations.filter(r=>r.sourceId===source.id)).toHaveLength(2);
  await act(async()=>composerRoot.unmount());host.remove();
});

// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import App from "./App";
import { initialData, Workspace } from "./workspace";
import type { DesktopCommand } from "./desktop";

function environment() {
  window.sessionStorage.clear();
  Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",{value:true,configurable:true});
  Object.defineProperty(window,"matchMedia",{value:()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}),configurable:true});
  window.history.replaceState(null,"","#/my-issues");
  let command: ((command:DesktopCommand)=>void)|undefined, close: (()=>Promise<void>)|undefined;
  const bridge={platform:"darwin",ready:vi.fn(async()=>{}),setBadge:vi.fn(async(_count:number)=>{}),windowAction:vi.fn(async()=>{}),
    onCommand:(callback:(command:DesktopCommand)=>void)=>{command=callback;return()=>{command=undefined;}},
    onCloseRequested:(callback:()=>Promise<void>)=>{close=callback;return()=>{close=undefined;}}};
  window.replicaDesktop=bridge;
  return {bridge,command:(value:DesktopCommand)=>command!(value),close:()=>close!()};
}
test("native menu creates and reopens tabs, badges unread items, and closes the final native tab through the host",async()=>{
  const e=environment(),workspace=new Workspace(initialData());
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  await act(async()=>root.render(createElement(App,{workspace})));
  expect(e.bridge.ready).toHaveBeenCalled();expect(e.bridge.setBadge).toHaveBeenCalled();
  await act(async()=>e.command({type:"new-tab"}));expect(host.querySelectorAll(".r-workspace-tab")).toHaveLength(2);
  await act(async()=>e.command({type:"navigate",route:"#/projects"}));
  expect(host.querySelector(".r-workspace-tab.active")?.textContent).toContain("Projects");
  await act(async()=>e.command({type:"close-tab"}));expect(host.querySelectorAll(".r-workspace-tab")).toHaveLength(1);
  await act(async()=>e.command({type:"reopen-tab"}));expect(host.querySelector(".r-workspace-tab.active")?.textContent).toContain("Projects");
  await act(async()=>e.command({type:"close-tab"}));await act(async()=>e.command({type:"close-tab"}));
  expect(e.bridge.windowAction).toHaveBeenCalledWith("close");
  await act(async()=>root.unmount());host.remove();delete window.replicaDesktop;
});
test("native close waits for pending storage and refuses acknowledgement after a failed save",async()=>{
  const e=environment();let finish:(()=>void)|undefined;
  const workspace=new Workspace(initialData(),{load:async()=>undefined,save:()=>new Promise<void>(resolve=>{finish=resolve;})});
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  await act(async()=>root.render(createElement(App,{workspace})));
  await act(async()=>workspace.createIssue({title:"Pending local save"}));
  let closed=false;const close=e.close().then(()=>{closed=true;});
  await Promise.resolve();expect(closed).toBe(false);
  await act(async()=>{finish!();await close;});expect(closed).toBe(true);
  workspace.saveState="error";workspace.saveError="Storage failed";
  await expect(e.close()).rejects.toThrow("Storage failed");
  await act(async()=>root.unmount());host.remove();delete window.replicaDesktop;
});

test("native close blurs active fields before acknowledging their save",async()=>{
  const e=environment(),workspace=new Workspace(initialData());
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  await act(async()=>root.render(createElement(App,{workspace})));
  const input=document.createElement("input");host.append(input);input.focus();
  input.addEventListener("blur",()=>workspace.createIssue({title:"Saved by blur before close"}));
  await act(async()=>e.close());
  expect(workspace.getSnapshot().issues.some(issue=>issue.title==="Saved by blur before close")).toBe(true);
  await act(async()=>root.unmount());host.remove();delete window.replicaDesktop;
});

test("native New submenu opens real project, initiative and chat screens without creating records",async()=>{
  const e=environment(),workspace=new Workspace(initialData());
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);
  await act(async()=>root.render(createElement(App,{workspace})));
  const counts={projects:workspace.getSnapshot().projects.length,initiatives:workspace.getSnapshot().initiatives.length,chats:workspace.getSnapshot().chats.length};
  await act(async()=>e.command({type:"new-project"}));
  expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("New project");
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click());
  await act(async()=>e.command({type:"new-initiative"}));
  expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("New initiative");
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click());
  await act(async()=>e.command({type:"new-chat"}));expect(location.hash).toBe("#/agent");
  expect({projects:workspace.getSnapshot().projects.length,initiatives:workspace.getSnapshot().initiatives.length,chats:workspace.getSnapshot().chats.length}).toEqual(counts);
  await act(async()=>root.unmount());host.remove();delete window.replicaDesktop;
});

test("restored native tabs retain independent histories and save the session before close acknowledgement",async()=>{
  const e=environment();window.history.replaceState(null,"","/");
  const {initialTabs,navigateTab,openTab}=await import("./tab-state");
  let session=navigateTab(initialTabs({nav:"inbox"}),{nav:"projects"});
  session=openTab(session,{nav:"cycles"});session=navigateTab(session,{nav:"archive"});
  const saveSession=vi.fn(async(_value:unknown)=>{});Object.assign(e.bridge,{saveSession});
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);
  await act(async()=>root.render(createElement(App,{workspace:new Workspace(initialData()),initialSession:session})));
  expect(location.hash).toBe("#/archive");expect(host.querySelectorAll(".r-workspace-tab")).toHaveLength(2);
  await act(async()=>e.command({type:"back"}));expect(location.hash).toBe("#/cycles");
  await act(async()=>host.querySelector<HTMLButtonElement>(".r-title-tab")!.click());expect(location.hash).toBe("#/projects");
  await act(async()=>e.command({type:"back"}));expect(location.hash).toBe("#/inbox");
  await act(async()=>e.close());
  expect(saveSession.mock.lastCall?.[0]).toMatchObject({items:[{route:{nav:"inbox"}},{route:{nav:"cycles"}}]});
  await act(async()=>root.unmount());host.remove();delete window.replicaDesktop;
});

test("desktop notifications require opt-in, skip historical inbox items and notify new arrivals once",async()=>{
  const e=environment(),data=initialData();data.settings.desktopNotifications=true;
  const notify=vi.fn(async(_value:unknown)=>true);Object.assign(e.bridge,{notify});
  const workspace=new Workspace(data),issue=workspace.createIssue({title:"Notify",subscribed:true});
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);
  await act(async()=>root.render(createElement(App,{workspace})));
  expect(notify).not.toHaveBeenCalled();
  await act(async()=>workspace.comment(issue.id,"New activity"));
  expect(notify).toHaveBeenCalledTimes(1);expect(notify.mock.lastCall?.[0]).toMatchObject({route:`#/issue/${issue.id}`,body:expect.stringContaining("New activity")});
  await act(async()=>workspace.mutate(d=>{d.settings.desktopNotifications=false;}));
  await act(async()=>workspace.comment(issue.id,"Opted out"));expect(notify).toHaveBeenCalledTimes(1);
  await act(async()=>workspace.mutate(d=>{d.settings.desktopNotifications=true;}));expect(notify).toHaveBeenCalledTimes(1);
  await act(async()=>root.unmount());host.remove();delete window.replicaDesktop;
});

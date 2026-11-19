// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import App from "./App";
import { AccountContext } from "./account-ui";
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

test("settings label color picker shows named swatches instead of hex codes",async()=>{
  environment();
  window.history.replaceState(null,"","#/settings");
  const workspace=new Workspace(initialData());
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);
  await act(async()=>root.render(createElement(App,{workspace})));
  const swatches=[...host.querySelectorAll<HTMLButtonElement>('[aria-label="Label color"] [role="radio"]')];
  expect(swatches.map(button=>button.getAttribute("aria-label"))).toEqual(["Indigo","Cyan","Green","Yellow","Orange","Red","Purple","Pink"]);
  expect(host.querySelector(".r-color-swatch-name")?.textContent).toBe("Indigo");
  expect(host.textContent).not.toContain("#5e6ad2");
  await act(async()=>swatches.find(button=>button.getAttribute("aria-label")==="Red")!.click());
  expect(host.querySelector(".r-color-swatch-name")?.textContent).toBe("Red");
  const name=host.querySelector<HTMLInputElement>('input[placeholder="bug"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(name,"regression");name!.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(async()=>host.querySelector(".r-color-swatches")!.closest("form")!.requestSubmit());
  expect(workspace.getSnapshot().labels.find(label=>label.name==="regression")?.color).toBe("#eb5757");
  await act(async()=>root.unmount());host.remove();delete window.replicaDesktop;
});

test("workspace More stays open after choosing Documents, Archive or Settings",async()=>{
  environment();
  const workspace=new Workspace(initialData());
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);
  await act(async()=>root.render(createElement(App,{workspace})));
  const more=host.querySelector(".r-nav-more > summary");
  await act(async()=>(more as HTMLElement).click());
  const documents=[...host.querySelectorAll(".r-workspace-more a")].find(link=>link.textContent?.includes("Documents"));
  expect(documents).toBeTruthy();
  await act(async()=>documents!.dispatchEvent(new MouseEvent("mousedown",{bubbles:true})));
  expect([...host.querySelectorAll(".r-workspace-more a")].map(link=>link.getAttribute("href"))).toEqual(["#/documents","#/archive","#/settings"]);
  await act(async()=>{
    (documents as HTMLAnchorElement).click();
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(location.hash).toBe("#/documents");
  expect(host.querySelector(".r-nav-more")?.hasAttribute("open")).toBe(true);
  expect(host.querySelector(".r-workspace-more")).not.toBeNull();
  await act(async()=>root.unmount());host.remove();delete window.replicaDesktop;
});

test("offline settings, inbox Confirmation, reviews and cycles expose the connected-workspace controls",async()=>{
  const e=environment(),workspace=new Workspace(initialData());
  workspace.updateTeam("XXH",{cycleDurationDays:14,triageAcceptStatus:"todo",triageDeclineStatus:"duplicate"});
  const reviewId=workspace.getSnapshot().reviews[0].id,issueId=workspace.getSnapshot().issues[0].id;
  workspace.mutate(d=>{
    d.inbox.unshift({id:"confirm-merge",issueId,kind:"confirmation",text:"Confirm merge of demo as the Workspace GitHub PAT owner.",time:new Date().toISOString(),read:false,confirmation:{action:"merge",reviewId}});
  });
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  await act(async()=>root.render(createElement(App,{workspace})));
  await act(async()=>e.command({type:"settings"}));
  expect(host.textContent).toContain("Cycle length (days)");
  expect(host.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("14");
  expect(host.textContent).toContain("This device is offline");
  expect(host.textContent).not.toContain("Fine-grained personal access token");
  expect(host.textContent).not.toContain("Save GitHub");
  expect(host.textContent).not.toContain("Save model");
  expect(host.textContent).not.toContain("Save coding executor");
  expect(host.querySelector('input[type="password"]')).toBeNull();
  expect(host.textContent).toContain("Issue templates");
  await act(async()=>e.command({type:"navigate",route:"#/inbox"}));
  await act(async()=>host.querySelector<HTMLButtonElement>(".r-inbox-list button")!.click());
  expect(host.textContent).toContain("Confirming authorizes the Workspace Connection");
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="Dismiss")!.click());
  expect(workspace.getSnapshot().inbox.find(item=>item.id==="confirm-merge")?.archivedAt).toBeTruthy();
  await act(async()=>e.command({type:"navigate",route:`#/reviews/${reviewId}`}));
  expect(host.textContent).toContain("Local review");
  expect(host.textContent).toContain("Mark merged locally");
  await act(async()=>e.command({type:"navigate",route:"#/cycles"}));
  expect(host.textContent).toContain("14-day cycles");
  await act(async()=>e.command({type:"navigate",route:"#/agent"}));
  expect(host.textContent).toContain("Local assistant");
  await act(async()=>e.command({type:"navigate",route:"#/loops"}));
  expect(host.textContent).toContain("Schedules run while this app is open");
  await act(async()=>root.unmount());host.remove();delete window.replicaDesktop;
});

test("a hosted renderer does not tick Loops and says schedules run on the account server",async()=>{
  const e=environment();
  Object.defineProperty(navigator,"locks",{value:undefined,configurable:true});
  vi.spyOn(document,"hasFocus").mockReturnValue(true);
  vi.useFakeTimers();
  const workspace=new Workspace(initialData(),{load:async()=>undefined,save:async()=>{},nextIssueIdentifier:()=>"XXH-1"});
  const tick=vi.spyOn(workspace,"tick");
  const account={
    user:{id:"user-1",email:"qa@example.test",name:"QA"},
    membership:{id:"ws-1",name:"QA workspace",role:"admin" as const},
    summary:{workspaces:[{id:"ws-1",name:"QA workspace",role:"admin" as const}],invitations:[]},
    members:[],
    refreshMembers:async()=>{},
    switchWorkspace:async()=>{},
    signOut:async()=>{},
    reconnect:()=>{},
  };
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  try {
    await act(async()=>root.render(createElement(AccountContext.Provider,{value:account},createElement(App,{workspace}))));
    await act(async()=>{vi.advanceTimersByTime(60_000);});
    expect(tick).not.toHaveBeenCalled();
    await act(async()=>e.command({type:"navigate",route:"#/loops"}));
    expect(host.textContent).toContain("Schedules run on the account server");
    expect(host.textContent).toContain("limited means the adapter is not connected");
  } finally {
    await act(async()=>root.unmount());host.remove();delete window.replicaDesktop;vi.useRealTimers();vi.restoreAllMocks();
  }
});

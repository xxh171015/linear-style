// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { parseReminderInput, reminderPresets } from "./reminders";
import { Workspace, initialData, migrateData } from "./workspace";
import { inInboxFolder, unreadInboxCount } from "./notifications";
import { WorkspaceContext } from "./ui";
import { IssueDetail } from "./issue-ui";

test("presets follow the observed local clock and week boundary",()=>{
  const now=new Date(2026,10,19,6,2), p=reminderPresets(now,[]);
  expect(p[0].date!.getTime()-now.getTime()).toBe(3600000);
  expect(p[1].date!.getTime()-now.getTime()).toBe(10800000);
  expect(p[2].date!.getHours()).toBe(18);
  expect(p[3].date!.getDate()).toBe(20);expect(p[3].date!.getHours()).toBe(9);
  expect(p[4].date!.getDate()).toBe(23);expect(p[4].date!.getDay()).toBe(1);
  expect(p[5].date!.getMonth()).toBe(11);expect(p[5].date!.getDate()).toBe(19);
  expect(p[6].date).toBeNull();
});
test("month arithmetic clamps end of month and Monday means the following Monday",()=>{
  expect(reminderPresets(new Date(2027,0,31,10),[])[5].date!.getDate()).toBe(28);
  const monday=new Date(2026,10,23,10);expect(reminderPresets(monday,[])[4].date!.getDate()).toBe(30);
});
test("typed times accept bounded relative and clock input, reject rollovers and past dates",()=>{
  const now=new Date(2026,10,19,10);
  expect(parseReminderInput("in 1 minute",now)!.getTime()-now.getTime()).toBe(60000);
  expect(parseReminderInput("2 days",now)!.getDate()).toBe(21);
  expect(parseReminderInput("4 pm",now)!.getHours()).toBe(16);
  expect(parseReminderInput("9:30 am",now)!.getDate()).toBe(20);
  for(const input of ["0 days","25:00","13 pm","2026-02-30","2026-11-18","unknown","in 10001 weeks"])
    expect(parseReminderInput(input,now),input).toBeNull();
});
test("scheduled reminders survive backup restore, become unread exactly when due, and never edit the issue",()=>{
  const w=new Workspace(initialData()), source=structuredClone(w.getSnapshot().issues[0]);
  const due=Date.now()+3600000,id=w.scheduleIssueReminder(source.id,new Date(due).toISOString());
  const restored=migrateData(structuredClone(w.getSnapshot())), item=restored.inbox.find(i=>i.id===id)!;
  expect(item.kind).toBe("reminder");expect(inInboxFolder(item,"snoozed",due-1)).toBe(true);
  expect(unreadInboxCount([item],due-1)).toBe(0);expect(unreadInboxCount([item],due)).toBe(1);
  expect(inInboxFolder(item,"inbox",due+1)).toBe(true);
  expect(w.getSnapshot().issues.find(i=>i.id===source.id)).toEqual(source);
});
test("reschedule replaces pending delivery, cancel archives it, failures publish no partial notification",()=>{
  const w=new Workspace(initialData()),id=w.getSnapshot().issues[0].id;
  const first=w.scheduleIssueReminder(id,new Date(Date.now()+3600000).toISOString());
  const second=w.scheduleIssueReminder(id,new Date(Date.now()+7200000).toISOString());
  expect(w.getSnapshot().inbox.some(i=>i.id===first)).toBe(false);
  w.cancelIssueReminder(second);expect(inInboxFolder(w.getSnapshot().inbox.find(i=>i.id===second)!,"archived")).toBe(true);
  const before=w.getSnapshot();
  expect(()=>w.scheduleIssueReminder(id,"invalid")).toThrow(/future/);
  expect(()=>w.scheduleIssueReminder("missing",new Date(Date.now()+3600000).toISOString())).toThrow(/Restore/);
  expect(w.getSnapshot()).toBe(before);
});
test("old backups remain valid, invalid reminder metadata is refused",()=>{
  const data=initialData();expect(()=>migrateData(data)).not.toThrow();
  data.inbox[0]={...data.inbox[0],kind:"other" as "reminder"};
  expect(()=>migrateData(data)).toThrow(/notification/);
});
test("Shift H opens reminder dialog, custom calendar pages, typed schedule saves without changing status",async()=>{
  Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",{value:true,configurable:true});
  const w=new Workspace(initialData()),id=w.getSnapshot().issues[0].id, source=structuredClone(w.getSnapshot().issues[0]);
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);
  await act(async()=>root.render(createElement(WorkspaceContext.Provider,{value:w},createElement(IssueDetail,{id,onClose:()=>{},onOpen:()=>{},onCreateChild:()=>{}}))));
  await act(async()=>window.dispatchEvent(new KeyboardEvent("keydown",{key:"H",shiftKey:true,bubbles:true})));
  expect(host.textContent).toContain("An hour from now");
  await act(async()=>Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent==="Custom…")!.click());
  expect(host.querySelectorAll('.r-reminder-calendars section')).toHaveLength(2);
  const previous=host.querySelector<HTMLButtonElement>('[aria-label="Previous month"]')!;
  expect(previous.disabled).toBe(true);
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!.click());
  expect(previous.disabled).toBe(false);
  await act(async()=>Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent==="Back")!.click());
  const input=host.querySelector<HTMLInputElement>('[aria-label="Reminder time"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"in 1 minute");input.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(async()=>input.closest("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(w.getSnapshot().inbox.filter(i=>i.kind==="reminder")).toHaveLength(1);
  expect(w.getSnapshot().issues.find(i=>i.id===id)).toEqual(source);
  await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();
});

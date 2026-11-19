import { expect, test } from "vitest";
import { deepLinkRoute, externalLink, localAsset, trustedRenderer } from "../desktop/policy.mjs";
import { activeRoute, closeTab, initialTabs, navigateTab, openTab, reopenTab, selectTab } from "./tab-state";
test("desktop origin and local asset mapping reject remote hosts and traversal",()=>{
  expect(trustedRenderer("replica://app/index.html#/issue/XXH-1")).toBe(true);
  for(const url of ["replica://app.evil/index.html","replica://user@app/index.html","file:///etc/passwd","https://app/"]){expect(trustedRenderer(url)).toBe(false);expect(localAsset("/tmp/dist",url)).toBeNull();}
  expect(localAsset("/tmp/dist","replica://app/assets/index.js")).toBe("/tmp/dist/assets/index.js");
  expect(localAsset("/tmp/dist","replica://app/%2e%2e%2fsecret")).toBeNull();
  expect(localAsset("/tmp/dist","replica://app/%00file")).toBeNull();
  expect(trustedRenderer("http://127.0.0.1:5174/#/inbox","http://127.0.0.1:5174")).toBe(true);
  expect(trustedRenderer("http://127.0.0.1:5175/","http://127.0.0.1:5174")).toBe(false);
});
test("only ordinary external links and declared deep-link routes are accepted",()=>{
  expect(externalLink("https://example.com/docs")).toBe("https://example.com/docs");
  for(const url of ["javascript:alert(1)","file:///etc/passwd","https://user:password@example.com","data:text/html,x"]){expect(externalLink(url)).toBeNull();}
  expect(deepLinkRoute("linear-replica://issue/XXH-16")).toBe("#/issue/XXH-16");
  expect(deepLinkRoute("linear-replica://archive")).toBe("#/archive");
  for(const url of ["linear://issue/XXH-16","linear-replica://issue/../../settings","linear-replica://issue/XXH-16?x=1","linear-replica://issue/XXH-16/extra"]){expect(deepLinkRoute(url)).toBeNull();}
});
test("tabs retain their own routes and close/reopen preserves the selected document",()=>{
  let state=initialTabs({nav:"my-issues",issueId:"XXH-1"});const first=state.activeId;
  state=openTab(state,{nav:"projects"});const second=state.activeId;
  state=navigateTab(state,{nav:"projects",id:"alpha"});
  state=selectTab(state,first);expect(activeRoute(state).issueId).toBe("XXH-1");
  state=navigateTab(state,{nav:"my-issues",issueId:"XXH-2"});
  state=selectTab(state,second);expect(activeRoute(state)).toEqual({nav:"projects",id:"alpha"});
  state=closeTab(state,second);expect(activeRoute(state).issueId).toBe("XXH-2");
  state=reopenTab(state);expect(activeRoute(state)).toEqual({nav:"projects",id:"alpha"});
  expect(state.activeId).not.toBe(second);
  expect(new Set(state.items.map(tab=>tab.id)).size).toBe(state.items.length);
});
test("closing an inactive tab keeps focus; closing the final browser tab leaves a valid workspace",()=>{
  let state=openTab(initialTabs({nav:"inbox"}),{nav:"archive"});
  const id=state.activeId;state=closeTab(state,1);expect(state.activeId).toBe(id);
  state=closeTab(state,id);expect(state.items).toHaveLength(1);expect(activeRoute(state)).toEqual({nav:"my-issues"});
  state=reopenTab(state);expect(activeRoute(state)).toEqual({nav:"archive"});
});

test("each tab has independent back/forward and a new navigation discards only its forward branch",async()=>{
  const {moveTabHistory,canMoveTabHistory}=await import("./tab-state");
  let state=navigateTab(initialTabs({nav:"inbox"}),{nav:"projects"});
  state=navigateTab(state,{nav:"projects",id:"alpha"});
  const first=state.activeId;
  state=openTab(state,{nav:"cycles"});state=navigateTab(state,{nav:"archive"});
  state=moveTabHistory(state,-1);expect(activeRoute(state)).toEqual({nav:"cycles"});
  state=selectTab(state,first);state=moveTabHistory(state,-1);expect(activeRoute(state)).toEqual({nav:"projects"});
  expect(canMoveTabHistory(state,1)).toBe(true);
  state=navigateTab(state,{nav:"reviews"});expect(canMoveTabHistory(state,1)).toBe(false);
  state=selectTab(state,state.items[1].id);expect(activeRoute(state)).toEqual({nav:"cycles"});
  expect(canMoveTabHistory(state,1)).toBe(true);
});
test("restoring and reopening sessions retain histories and recover safely from malformed input",async()=>{
  const {moveTabHistory,restoreTabs}=await import("./tab-state");
  let state=navigateTab(initialTabs({nav:"inbox"}),{nav:"projects"});
  state=openTab(state,{nav:"cycles"});state=navigateTab(state,{nav:"archive"});state=closeTab(state,state.activeId);
  state=restoreTabs(JSON.stringify(state),{nav:"my-issues"});
  state=reopenTab(state);state=moveTabHistory(state,-1);expect(activeRoute(state)).toEqual({nav:"cycles"});
  for(const invalid of [null,"{",{...state,activeId:999},{...state,items:[state.items[0],state.items[0]]},{...state,items:[{...state.items[0],cursor:999}]}])
    expect(activeRoute(restoreTabs(invalid,{nav:"my-issues"}))).toEqual({nav:"my-issues"});
});

import { routeHash, type Route } from "./router";
export type WorkspaceTab = { id: number; route: Route; history: Route[]; cursor: number };
export type TabState = { items: WorkspaceTab[]; activeId: number; nextId: number; closed: WorkspaceTab[] };
const tab = (id:number,route:Route):WorkspaceTab => ({id,route,history:[route],cursor:0});
export const initialTabs = (route: Route): TabState => ({items:[tab(1,route)],activeId:1,nextId:2,closed:[]});
export function navigateTab(state: TabState, route: Route): TabState {
  const current=state.items.find(t=>t.id===state.activeId)!;
  if(routeHash(current.route)===routeHash(route))return state;
  return {...state,items:state.items.map(t=>{
    if(t.id!==state.activeId)return t;
    const history=[...t.history.slice(0,t.cursor+1),route].slice(-50);
    return {...t,route,history,cursor:history.length-1};
  })};
}
export function moveTabHistory(state:TabState,delta:-1|1):TabState {
  return {...state,items:state.items.map(t=>{
    if(t.id!==state.activeId)return t;
    const cursor=Math.max(0,Math.min(t.history.length-1,t.cursor+delta));
    return {...t,cursor,route:t.history[cursor]};
  })};
}
export function canMoveTabHistory(state:TabState,delta:-1|1) {
  const t=state.items.find(t=>t.id===state.activeId)!;
  return delta===-1?t.cursor>0:t.cursor<t.history.length-1;
}
export function openTab(state: TabState, route: Route): TabState {
  return {...state,items:[...state.items,tab(state.nextId,route)],activeId:state.nextId,nextId:state.nextId+1};
}
export function selectTab(state: TabState,id:number): TabState {
  return state.items.some(t=>t.id===id)?{...state,activeId:id}:state;
}
export function closeTab(state: TabState,id:number): TabState {
  const index=state.items.findIndex(t=>t.id===id);
  if(index<0)return state;
  const closed=[state.items[index],...state.closed].slice(0,20);
  if(state.items.length===1)return {...initialTabs({nav:"my-issues"}),nextId:state.nextId+1,items:[tab(state.nextId,{nav:"my-issues"})],activeId:state.nextId,closed};
  const items=state.items.filter(t=>t.id!==id);
  return {...state,items,closed,activeId:state.activeId===id?items[Math.min(index,items.length-1)].id:state.activeId};
}
export function reopenTab(state:TabState):TabState {
  if(!state.closed.length)return state;
  return {...state,items:[...state.items,{...state.closed[0],id:state.nextId}],activeId:state.nextId,nextId:state.nextId+1,closed:state.closed.slice(1)};
}
export function activeRoute(state:TabState):Route {return state.items.find(t=>t.id===state.activeId)!.route;}

const navs=new Set(["inbox","my-issues","reviews","agent","projects","views","loops","team-home","team-issues","triage","cycles","initiatives","settings","archive","documents"]);
function validRoute(value:unknown):value is Route {
  if(!value || typeof value!=="object")return false;
  const r=value as Record<string,unknown>;
  return typeof r.nav==="string" && navs.has(r.nav) && ["id","section","issueId"].every(key=>r[key]===undefined || (typeof r[key]==="string" && r[key].length<=200)) && (r.peek===undefined || typeof r.peek==="boolean");
}
// Session files are recoverable UI state; malformed snapshots never replace a workspace.
export function restoreTabs(value:unknown,fallback:Route):TabState {
  try {
    const v=(typeof value==="string"?JSON.parse(value):value) as TabState;
    if(!v || !Array.isArray(v.items) || !v.items.length || v.items.length>50 || !Array.isArray(v.closed) || v.closed.length>20)throw Error();
    const recover=(input:WorkspaceTab):WorkspaceTab=>{
      if(!Number.isSafeInteger(input.id) || input.id<1 || !validRoute(input.route))throw Error();
      if(!input.history)return tab(input.id,input.route);
      if(!Array.isArray(input.history) || !input.history.length || input.history.length>50 || !input.history.every(validRoute) || !Number.isInteger(input.cursor) || input.cursor<0 || input.cursor>=input.history.length)throw Error();
      return {...input,route:input.history[input.cursor]};
    };
    const items=v.items.map(recover),ids=items.map(t=>t.id);
    if(new Set(ids).size!==ids.length || !ids.includes(v.activeId))throw Error();
    const closed=v.closed.map(t=>validRoute(t)?tab(1,t):recover(t));
    return {items,activeId:v.activeId,nextId:Math.max(...ids,...closed.map(t=>t.id))+1,closed};
  }catch{return initialTabs(fallback);}
}

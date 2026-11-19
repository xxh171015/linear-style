import { mergeWorkspace } from "./workspace-merge";
import { decodeWorkspace, encodeWorkspace } from "./workspace-wire";
import type { Repository, WorkspaceData } from "./workspace";

export type AccountUser={id:string;email:string;name:string};
export type AccountSession={configured:true;user:AccountUser|null};
export type MemberRole="admin"|"member";
export type WorkspaceMembership={id:string;name:string;role:MemberRole};
export type WorkspaceInvitation={id:string;workspaceId:string;workspace:string;role:MemberRole;createdAt:string;expiresAt:number};
export type WorkspaceMember=AccountUser&{role:MemberRole;joinedAt:string};
export type MembershipSummary={workspaces:WorkspaceMembership[];invitations:WorkspaceInvitation[]};
export function accountRequest(accountId:string,workspaceId?:string,request:typeof fetch=fetch):typeof fetch {
  return async(input,init={})=>{
    const headers=new Headers(init.headers);headers.set("X-Replica-Account",accountId);if(workspaceId)headers.set("X-Replica-Workspace",workspaceId);
    const response=await request(input,{...init,headers});
    if(response.ok&&(response.headers.get("X-Replica-Account")!==accountId||(workspaceId&&response.headers.get("X-Replica-Workspace")!==workspaceId)))throw new ServerError(403,"This response belongs to a different account or workspace. Reconnect before saving.");
    return response;
  };
}
export class ServerError extends Error { status:number; constructor(status:number,message:string){super(message);this.status=status;} }
const TOKEN_KEY="replica:account-token", ORIGIN_KEY="replica:account-origin", ENABLED_KEY="replica:account-enabled";
export function accountApiBase() {
  if(typeof window==="undefined" || !window.replicaDesktop) return "";
  try { return (localStorage.getItem(ORIGIN_KEY) || "http://127.0.0.1:4175").replace(/\/$/,""); }
  catch { return "http://127.0.0.1:4175"; }
}
export function setAccountApiBase(origin:string) {
  try { localStorage.setItem(ORIGIN_KEY, origin.trim().replace(/\/$/,"")); } catch { /* Storage may be unavailable. */ }
}
export function accountEnabled() {
  if(typeof window==="undefined") return false;
  if(!window.replicaDesktop) return true;
  try { return localStorage.getItem(ENABLED_KEY)==="1"; } catch { return false; }
}
export function setAccountEnabled(enabled:boolean) {
  try { if(enabled) localStorage.setItem(ENABLED_KEY,"1"); else localStorage.removeItem(ENABLED_KEY); } catch { /* Storage may be unavailable. */ }
}
function accountToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setAccountToken(token:string|null) {
  try { if(token) localStorage.setItem(TOKEN_KEY,token); else localStorage.removeItem(TOKEN_KEY); } catch { /* Storage may be unavailable. */ }
}
function apiUrl(path:string) {
  return path.startsWith("/") && accountApiBase() ? `${accountApiBase()}${path}` : path;
}
export async function serverRequest(path:string,init:RequestInit={},request:typeof fetch=fetch) {
  const headers={"Content-Type":"application/json","X-Replica-Client":"1",...init.headers} as Record<string,string>;
  const token=accountToken();
  if(token) headers.Authorization=`Bearer ${token}`;
  const response=await request(apiUrl(path),{...init,credentials:accountApiBase()?"omit":"same-origin",headers});
  let value;
  try{value=await response.json();}catch{throw new Error("The workspace server returned an invalid response.");}
  if(!response.ok)throw new ServerError(response.status,value.error??"The server request failed.");
  if(typeof value?.token==="string" && /^[a-f0-9]{64}$/.test(value.token)) setAccountToken(value.token);
  if(path.includes("/api/auth/logout")) setAccountToken(null);
  return value;
}
export async function discoverServer():Promise<AccountSession|null> {
  const headers:Record<string,string>={};
  const token=accountToken();
  if(token) headers.Authorization=`Bearer ${token}`;
  let response:Response;
  try {
    response=await fetch(apiUrl("/api/session"),{credentials:accountApiBase()?"omit":"same-origin",cache:"no-store",headers});
  } catch {
    if(accountApiBase()) return null;
    throw Error("Unable to reach the workspace server. Retry to keep using your saved account.");
  }
  if(!response.ok&&response.status!==404) {
    if(accountApiBase()) return null;
    throw Error("Unable to reach the workspace server. Retry to keep using your saved account.");
  }
  if(response.status===404 || !response.headers.get("content-type")?.includes("application/json"))return null;
  if(!response.ok)throw Error("Unable to reach the workspace server. Retry to keep using your saved account.");
  const session=await response.json();
  if(session.configured!==true)throw Error("The workspace server returned an invalid session.");
  return session;
}
export class RemoteRepository implements Repository {
  private request:typeof fetch;
  private accountId?:string;
  private workspaceId?:string;
  private identifiers=new Map<string,string[]>();
  private reservation=new Map<string,Promise<void>>();
  constructor(request:typeof fetch=fetch,accountId?:string,workspaceId?:string){
    this.accountId=accountId;
    this.workspaceId=workspaceId;
    this.request=async(input,init={})=>{
      const headers=new Headers(init.headers);if(this.accountId)headers.set("X-Replica-Account",this.accountId);
      if(this.workspaceId)headers.set("X-Replica-Workspace",this.workspaceId);
      const response=await request(input,{...init,headers}),observed=response.headers.get("X-Replica-Account"),space=response.headers.get("X-Replica-Workspace");
      if(response.ok){
        if(!observed)throw new ServerError(503,"The workspace server could not identify this account. Update or reconnect the server before saving.");
        if(this.accountId&&this.accountId!==observed)throw new ServerError(403,"This window belongs to a different account. Reconnect it before saving.");
        this.accountId=observed;
        if(!space)throw new ServerError(503,"The workspace server could not identify this workspace. Update the server before saving.");
        if(this.workspaceId&&this.workspaceId!==space)throw new ServerError(403,"This response belongs to a different workspace. Reopen the workspace before saving.");
        this.workspaceId=space;
      }
      return response;
    };
  }
  private reserve(prefix="XXH") {
    const pending=this.reservation.get(prefix);
    if(pending)return pending;
    const work=(async()=>{
      const range=await serverRequest("/api/issue-identifiers",{method:"POST",body:JSON.stringify({prefix})},this.request);
      if(range.prefix!==prefix||!Number.isSafeInteger(range.start)||range.start<1||range.count!==16)throw Error("Invalid issue identifier reservation.");
      const queue=this.identifiers.get(prefix)??[];
      queue.push(...Array.from({length:range.count},(_,i)=>`${range.prefix}-${range.start+i}`));
      this.identifiers.set(prefix,queue);
    })().finally(()=>{this.reservation.delete(prefix);});
    this.reservation.set(prefix,work);
    return work;
  }
  nextIssueIdentifier(teamKey="XXH") {
    const queue=this.identifiers.get(teamKey)??[];
    const id=queue.shift();
    this.identifiers.set(teamKey,queue);
    if(!id){void this.reserve(teamKey).catch(()=>{});throw Error("Reconnect to reserve more issue identifiers, then retry creating the issue. Your draft is retained.");}
    if(queue.length<4)void this.reserve(teamKey).catch(()=>{});
    return id;
  }
  async load():Promise<WorkspaceData> {
    const data=decodeWorkspace(await serverRequest("/api/workspace",{cache:"no-store"},this.request));
    if(![...this.identifiers.values()].some(queue=>queue.length))await this.reserve(data.settings.currentTeamKey || "XXH");return data;
  }
  async commit(data:WorkspaceData,base:WorkspaceData,preferLocal=false):Promise<WorkspaceData> {
    for(let attempt=0;attempt<8;attempt++) {
      const shared=await this.load();
      const merged=await mergeWorkspace(base,data,shared,preferLocal);
      try {
        return decodeWorkspace(await serverRequest("/api/workspace",{method:"PUT",body:JSON.stringify({expectedRevision:shared.revision,workspace:await encodeWorkspace(merged)})},this.request));
      }catch(error){if(!(error instanceof ServerError)||error.status!==409)throw error;}
    }
    throw Error("The workspace is busy in another session. Retry saving.");
  }
  async save(data:WorkspaceData){await this.commit(data,await this.load());}
  watch(changed:()=>void) {
    if(typeof window==="undefined")return ()=>{};
    const refresh=()=>changed();
    const events=!accountApiBase() && typeof EventSource!=="undefined"?new EventSource(`/api/events?${new URLSearchParams({account:this.accountId??"",workspace:this.workspaceId??""})}`):undefined;
    events?.addEventListener("message",refresh);
    events?.addEventListener("open",refresh);
    events?.addEventListener("error",refresh);
    // Polling also recovers events missed while the device was asleep or disconnected.
    const timer=setInterval(refresh,15000);
    window.addEventListener("focus",refresh);window.addEventListener("online",refresh);
    return ()=>{events?.close();clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener("online",refresh);};
  }
}

import { test, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Server } from "node:http";
import { createReplicaServer } from "../server/app";
import { tickWorkspaceRow } from "../server/scheduler";
import { RemoteRepository } from "./remote-repository";
import { encodeWorkspace } from "./workspace-wire";
import { Workspace, DEFAULT_DISPLAY } from "./workspace";
import { WorkspaceConflict } from "./workspace-merge";

const password="replica-test-password-1234";
async function start(databasePath:string) {
  const server=createReplicaServer({databasePath});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();if(!address||typeof address==="string")throw Error("No test address");
  return {server,origin:`http://127.0.0.1:${address.port}`};
}
async function close(server:Server){await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});}
function client(origin:string) {
  let cookie="";
  const request:typeof fetch=async(input,init={})=>{
    const headers=new Headers(init.headers);headers.set("X-Replica-Client","1");headers.set("Content-Type","application/json");headers.set("Origin",origin);if(cookie)headers.set("Cookie",cookie);
    const response=await fetch(new URL(String(input),origin),{...init,headers});
    const next=response.headers.get("set-cookie");if(next!==null)cookie=next.split(";")[0];return response;
  };
  return {request,get cookie(){return cookie;},register:(email="qa@example.test",name="QA")=>request("/api/auth/register",{method:"POST",body:JSON.stringify({email,password,name,workspace:"QA workspace"})})};
}
async function fixture(run:(origin:string,database:string,server:Server)=>Promise<void>) {
  const directory=mkdtempSync(path.join(tmpdir(),"linear-replica-server-")),database=path.join(directory,"test.sqlite");
  const {server,origin}=await start(database);
  try{await run(origin,database,server);}finally{if(server.listening)await close(server);rmSync(directory,{recursive:true,force:true});}
}
test("accounts use expiring HttpOnly sessions and salted password hashes, login/logout validate identity",async()=>fixture(async(origin,database)=>{
  const c=client(origin),created=await c.register();expect(created.status).toBe(201);
  expect(created.headers.get("set-cookie")).toContain("HttpOnly");expect(created.headers.get("set-cookie")).toContain("SameSite=Strict");
  expect((await (await c.request("/api/session")).json()).user.email).toBe("qa@example.test");
  const db=new DatabaseSync(database);const row=db.prepare("SELECT password_hash,salt FROM users").get()!;
  expect(row.password_hash).not.toContain(password);expect(String(row.password_hash)).toHaveLength(128);expect(String(row.salt)).toHaveLength(32);db.close();
  await c.request("/api/auth/logout",{method:"POST"});expect((await c.request("/api/workspace")).status).toBe(401);
  expect((await c.request("/api/auth/login",{method:"POST",body:JSON.stringify({email:"qa@example.test",password:"wrong"})})).status).toBe(401);
  expect((await c.request("/api/auth/login",{method:"POST",body:JSON.stringify({email:"QA@EXAMPLE.TEST",password})})).status).toBe(200);
}));
test("accounts cannot read or overwrite another account's workspace",async()=>fixture(async origin=>{
  const a=client(origin),b=client(origin),anonymous=client(origin);await a.register("a@example.test");await b.register("b@example.test");
  const repo=new RemoteRepository(a.request),before=await repo.load(),w=new Workspace(before);w.createIssue({title:"Only A"});await repo.commit(w.getSnapshot(),before);
  expect((await new RemoteRepository(b.request).load()).issues).toHaveLength(0);
  expect((await anonymous.request("/api/workspace")).status).toBe(401);
}));
test("expired sessions cannot read account data and reconnect creates a new usable session",async()=>fixture(async(origin,database)=>{
  const c=client(origin);await c.register();
  const db=new DatabaseSync(database);db.prepare("UPDATE sessions SET expires_at=?").run(Date.now()-1);db.close();
  expect((await c.request("/api/workspace")).status).toBe(401);
  expect((await (await c.request("/api/session")).json()).user).toBeNull();
  expect((await c.request("/api/auth/login",{method:"POST",body:JSON.stringify({email:"qa@example.test",password})})).status).toBe(200);
  expect((await c.request("/api/workspace")).status).toBe(200);
}));
test("an old window cannot load or upload its edits after another tab switches the cookie to a different account",async()=>fixture(async origin=>{
  const c=client(origin),other=client(origin);await c.register("first@example.test");await other.register("second@example.test");
  const repo=new RemoteRepository(c.request),base=await repo.load(),w=new Workspace(base);w.createIssue({title:"Private first-account draft"});
  await c.request("/api/auth/login",{method:"POST",body:JSON.stringify({email:"second@example.test",password})});
  await expect(repo.load()).rejects.toMatchObject({status:403});
  await expect(repo.commit(w.getSnapshot(),base)).rejects.toMatchObject({status:403});
  expect((await new RemoteRepository(other.request).load()).issues).toHaveLength(0);
}));
test("account-bound repositories refuse an older server response without account identity",async()=>{
  const request:typeof fetch=async()=>new Response("{}",{status:200,headers:{"Content-Type":"application/json"}});
  await expect(new RemoteRepository(request,"account-a").load()).rejects.toMatchObject({status:503});
});
test("server compare-and-swap refuses stale writes and validates workspace before storage",async()=>fixture(async origin=>{
  const c=client(origin);await c.register();const repo=new RemoteRepository(c.request),before=await repo.load();
  const w=new Workspace(before);w.createIssue({title:"First"});await repo.commit(w.getSnapshot(),before);
  const stale=await c.request("/api/workspace",{method:"PUT",body:JSON.stringify({expectedRevision:0,workspace:await encodeWorkspace(before)})});expect(stale.status).toBe(409);
  const bad=await encodeWorkspace(await repo.load());bad.issues[0].status="invalid" as "todo";
  expect((await c.request("/api/workspace",{method:"PUT",body:JSON.stringify({expectedRevision:1,workspace:bad})})).status).toBe(400);
  expect((await repo.load()).issues[0].title).toBe("First");
}));
test("remote repository merges independent edits and surfaces conflicting title edits",async()=>fixture(async origin=>{
  const c=client(origin),second=client(origin);await c.register();
  await second.request("/api/auth/login",{method:"POST",body:JSON.stringify({email:"qa@example.test",password})});expect(second.cookie).not.toBe(c.cookie);
  const repo=new RemoteRepository(c.request),otherRepo=new RemoteRepository(second.request),empty=await repo.load(),seed=new Workspace(empty),issue=seed.createIssue({title:"Shared"});
  const base=await repo.commit(seed.getSnapshot(),empty),a=new Workspace(base),b=new Workspace(base);
  a.updateIssue(issue.id,{title:"Changed title"});b.updateIssue(issue.id,{priority:2});await repo.commit(a.getSnapshot(),base);
  const merged=await otherRepo.commit(b.getSnapshot(),base);expect(merged.issues[0]).toMatchObject({title:"Changed title",priority:2});
  const left=new Workspace(merged),right=new Workspace(merged);left.updateIssue(issue.id,{title:"Left"});right.updateIssue(issue.id,{title:"Right"});
  await repo.commit(left.getSnapshot(),merged);await expect(repo.commit(right.getSnapshot(),merged)).rejects.toBeInstanceOf(WorkspaceConflict);
}));
test("attachment contents and account sessions survive a server restart",async()=>fixture(async(origin,database,server)=>{
  const c=client(origin);await c.register();const repo=new RemoteRepository(c.request),base=await repo.load(),w=new Workspace(base);
  const issue=w.createIssue({title:"Attachment"});w.mutate(d=>{d.attachments.push({id:"file",ownerId:issue.id,name:"notes.txt",mime:"text/plain",size:5,blob:new Blob(["hello"],{type:"text/plain"})});});
  await repo.commit(w.getSnapshot(),base);const cookie=c.cookie;await close(server);
  const restarted=await start(database);
  try {
    const response=await fetch(`${restarted.origin}/api/workspace`,{headers:{Cookie:cookie}});expect(response.status).toBe(200);
    const data=await response.json();expect(data.attachments[0].blob).toEqual([104,101,108,108,111]);
  }finally{await close(restarted.server);}
}));
test("cross-origin mutations, missing client headers and malformed login bodies are rejected",async()=>fixture(async origin=>{
  const response=await fetch(`${origin}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://other.example","X-Replica-Client":"1"},body:"{}"});expect(response.status).toBe(403);
  expect((await fetch(`${origin}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).status).toBe(403);
  expect((await client(origin).request("/api/auth/login",{method:"POST",body:"null"})).status).toBe(400);
}));
test("subscribed sessions receive real revision events",async()=>fixture(async origin=>{
  const c=client(origin);await c.register();const controller=new AbortController();
  const response=await c.request("/api/events",{signal:controller.signal}),reader=response.body!.getReader();
  await reader.read();const next=reader.read();const repo=new RemoteRepository(c.request),base=await repo.load(),w=new Workspace(base);w.createIssue({title:"Push update"});await repo.commit(w.getSnapshot(),base);
  const event=await next;expect(new TextDecoder().decode(event.value)).toContain("data: 1");controller.abort();await reader.cancel().catch(()=>{});
}));
test("two sessions creating issues concurrently receive distinct durable identifiers",async()=>fixture(async origin=>{
  const a=client(origin),b=client(origin);await a.register();await b.request("/api/auth/login",{method:"POST",body:JSON.stringify({email:"qa@example.test",password})});
  const ra=new RemoteRepository(a.request),rb=new RemoteRepository(b.request);
  const wa=new Workspace(await ra.load(),ra),wb=new Workspace(await rb.load(),rb);
  const first=wa.createIssue({title:"Concurrent A"}),second=wb.createIssue({title:"Concurrent B"});expect(first.id).not.toBe(second.id);
  await Promise.all([wa.flushed(),wb.flushed()]);expect(wa.saveState).toBe("saved");expect(wb.saveState).toBe("saved");
  expect((await ra.load()).issues.map(issue=>issue.title).sort()).toEqual(["Concurrent A","Concurrent B"]);wa.dispose();wb.dispose();
}));

async function joinWorkspace(origin:string) {
  const a=client(origin),b=client(origin);const owner=await (await a.register("alice@example.test","Alice")).json();const guest=await (await b.register("bob@example.test","Bob")).json();
  const workspaceId=owner.user.id as string;
  const created=await a.request("/api/invitations",{method:"POST",body:JSON.stringify({email:"bob@example.test"})});expect(created.status).toBe(201);
  const invitation=await created.json();
  expect((await b.request(`/api/invitations/${invitation.id}/accept`,{method:"POST",body:JSON.stringify({code:invitation.code})})).status).toBe(200);
  return {a,b,workspaceId,memberId:guest.user.id as string};
}
test("invited accounts jointly edit one workspace while retaining their own workspace and actor names",async()=>fixture(async origin=>{
  const {a,b,workspaceId}=await joinWorkspace(origin);
  const ra=new RemoteRepository(a.request,undefined,workspaceId),rb=new RemoteRepository(b.request,undefined,workspaceId);
  const wa=new Workspace(await ra.load(),ra),wb=new Workspace(await rb.load(),rb);
  expect(wa.getSnapshot().settings.user).toBe("Alice");expect(wb.getSnapshot().settings.user).toBe("Bob");
  const first=wa.createIssue({title:"Alice task"}),second=wb.createIssue({title:"Bob task"});expect(first.id).not.toBe(second.id);
  await Promise.all([wa.flushed(),wb.flushed()]);
  const shared=await rb.load();expect(shared.issues.map(item=>item.title).sort()).toEqual(["Alice task","Bob task"]);
  expect(shared.issues.find(item=>item.title==="Alice task")?.creator).toBe("Alice");expect(shared.issues.find(item=>item.title==="Bob task")?.creator).toBe("Bob");
  expect((await new RemoteRepository(b.request).load()).issues).toHaveLength(0);
  expect((await (await b.request("/api/workspaces")).json()).workspaces).toHaveLength(2);wa.dispose();wb.dispose();
}));
test("members' drafts, inbox, chats, favorites, display preferences and private files never cross account boundaries",async()=>fixture(async origin=>{
  const {a,b,workspaceId}=await joinWorkspace(origin),ra=new RemoteRepository(a.request,undefined,workspaceId),rb=new RemoteRepository(b.request,undefined,workspaceId);
  const base=await ra.load(),wa=new Workspace(base),issue=wa.createIssue({title:"Shared issue"});
  wa.mutate(d=>{d.draft.title="Alice private draft";d.chats.push({id:"alice-chat",title:"Private conversation",createdAt:new Date().toISOString(),messages:[]});d.favorites.push({id:`issue:${issue.id}`,kind:"issue",targetId:issue.id});d.preferences.alice={...DEFAULT_DISPLAY,layout:"board"};d.settings.weekStartsOn=0;d.settings.desktopNotifications=true;for(const ownerId of ["draft","agent-draft","alice-chat",issue.id])d.attachments.push({id:ownerId,ownerId,name:"notes.txt",mime:"text/plain",size:6,blob:new Blob(["secret"])});});
  await ra.commit(wa.getSnapshot(),base);
  const bob=await rb.load();expect(bob.draft.title).toBe("");expect(bob.chats).toEqual([]);expect(bob.favorites).toEqual([]);expect(bob.inbox).toEqual([]);expect(bob.preferences.alice).toBeUndefined();expect(bob.settings.weekStartsOn).toBe(1);expect(bob.settings.desktopNotifications).toBeUndefined();expect(bob.attachments.map(item=>item.ownerId)).toEqual([issue.id]);
  const wb=new Workspace(bob);wb.updateIssue(issue.id,{priority:1});wb.mutate(d=>{d.draft.title="Bob private draft";});await rb.commit(wb.getSnapshot(),bob);
  const alice=await ra.load();expect(alice.issues[0].priority).toBe(1);expect(alice.draft.title).toBe("Alice private draft");expect(alice.chats[0].title).toBe("Private conversation");expect(alice.favorites.some(item=>item.targetId===issue.id)).toBe(true);expect(alice.attachments).toHaveLength(4);expect(alice.settings.user).toBe("Alice");
  expect((await rb.load()).draft.title).toBe("Bob private draft");
}));
test("only admins may invite, change roles, remove members or rename the shared workspace",async()=>fixture(async origin=>{
  const {a,b,workspaceId,memberId}=await joinWorkspace(origin),headers={"X-Replica-Workspace":workspaceId};
  expect((await b.request("/api/invitations",{method:"POST",headers,body:JSON.stringify({email:"third@example.test"})})).status).toBe(403);
  expect((await b.request(`/api/members/${memberId}`,{method:"PATCH",headers,body:JSON.stringify({role:"admin"})})).status).toBe(403);
  expect((await b.request(`/api/members/${workspaceId}`,{method:"DELETE",headers})).status).toBe(403);
  const repo=new RemoteRepository(b.request,undefined,workspaceId),base=await repo.load(),w=new Workspace(base);w.mutate(d=>{d.settings.workspace="Forbidden rename";});
  await expect(repo.commit(w.getSnapshot(),base)).rejects.toMatchObject({status:403});
  expect((await a.request(`/api/members/${memberId}`,{method:"PATCH",body:JSON.stringify({role:"admin"})})).status).toBe(200);
  expect((await b.request("/api/invitations",{method:"POST",headers,body:JSON.stringify({email:"third@example.test"})})).status).toBe(201);
  const latest=await repo.load(),renamed=new Workspace(latest);renamed.mutate(d=>{d.settings.workspace="Renamed by admin";});expect((await repo.commit(renamed.getSnapshot(),latest)).settings.workspace).toBe("Renamed by admin");
  expect((await a.request(`/api/members/${memberId}`,{method:"PATCH",body:JSON.stringify({role:"member"})})).status).toBe(200);
  expect((await b.request("/api/invitations",{method:"POST",headers,body:JSON.stringify({email:"fourth@example.test"})})).status).toBe(403);
}));
test("the final admin cannot be demoted or removed and invalid roles are rejected",async()=>fixture(async origin=>{
  const a=client(origin),owner=await (await a.register()).json(),id=owner.user.id;
  expect((await a.request(`/api/members/${id}`,{method:"PATCH",body:JSON.stringify({role:"member"})})).status).toBe(409);
  expect((await a.request(`/api/members/${id}`,{method:"DELETE"})).status).toBe(409);
  expect((await a.request(`/api/members/${id}`,{method:"PATCH",body:JSON.stringify({role:"owner"})})).status).toBe(400);
}));
test("invitations require the addressed account, expire, and can be revoked or declined without granting access",async()=>fixture(async(origin,database)=>{
  const a=client(origin),b=client(origin),c=client(origin);await a.register();await b.register("bob@example.test");await c.register("carol@example.test");
  const invite=async()=>{const r=await a.request("/api/invitations",{method:"POST",body:JSON.stringify({email:"bob@example.test"})});expect(r.status).toBe(201);return (await r.json()).id as string;};
  let id=await invite();expect((await c.request(`/api/invitations/${id}/accept`,{method:"POST",body:"{}"})).status).toBe(404);
  expect((await b.request(`/api/invitations/${id}`,{method:"DELETE"})).status).toBe(200);expect((await b.request(`/api/invitations/${id}/accept`,{method:"POST",body:"{}"})).status).toBe(404);
  id=await invite();expect((await a.request(`/api/workspace-invitations/${id}`,{method:"DELETE"})).status).toBe(200);expect((await b.request(`/api/invitations/${id}/accept`,{method:"POST",body:"{}"})).status).toBe(404);
  id=await invite();const db=new DatabaseSync(database);db.prepare("UPDATE workspace_invitations SET expires_at=? WHERE id=?").run(Date.now()-1,id);db.close();expect((await b.request(`/api/invitations/${id}/accept`,{method:"POST",body:"{}"})).status).toBe(404);expect((await (await b.request("/api/workspaces")).json()).invitations).toEqual([]);
}));
test("revoking membership closes live events and rejects retained repositories on all shared endpoints",async()=>fixture(async origin=>{
  const {a,b,workspaceId,memberId}=await joinWorkspace(origin),repo=new RemoteRepository(b.request,undefined,workspaceId),base=await repo.load(),w=new Workspace(base);w.createIssue({title:"Stale edit"});
  const controller=new AbortController(),events=await b.request(`/api/events?workspace=${workspaceId}&account=${memberId}`,{signal:controller.signal}),reader=events.body!.getReader();await reader.read();
  expect((await a.request(`/api/members/${memberId}`,{method:"DELETE"})).status).toBe(200);
  expect((await reader.read()).done).toBe(true);controller.abort();
  await expect(repo.load()).rejects.toMatchObject({status:403});await expect(repo.commit(w.getSnapshot(),base)).rejects.toMatchObject({status:403});
  expect((await b.request("/api/issue-identifiers",{method:"POST",headers:{"X-Replica-Workspace":workspaceId}})).status).toBe(403);
  expect((await b.request("/api/members",{headers:{"X-Replica-Workspace":workspaceId}})).status).toBe(403);
  expect((await b.request(`/api/events?workspace=${workspaceId}&account=${memberId}`)).status).toBe(403);
  expect((await new RemoteRepository(b.request).load()).issues).toEqual([]);
}));
test("legacy account snapshots migrate with their private fields and session intact",async()=>fixture(async(origin,database,server)=>{
  const a=client(origin);await a.register();const repo=new RemoteRepository(a.request),base=await repo.load(),w=new Workspace(base);w.createIssue({title:"Legacy task"});w.mutate(d=>{d.draft.title="Legacy draft";d.chats.push({id:"old-chat",title:"Legacy chat",createdAt:new Date().toISOString(),messages:[]});});
  const legacy=await encodeWorkspace(w.getSnapshot());await close(server);const db=new DatabaseSync(database);db.exec("DROP TABLE workspace_personal; DROP TABLE workspace_invitations; DROP TABLE workspace_members;");db.prepare("UPDATE workspaces SET data=?,revision=?").run(JSON.stringify(legacy),legacy.revision);db.close();
  const restarted=await start(database);
  try{const response=await fetch(`${restarted.origin}/api/workspace`,{headers:{Cookie:a.cookie}});expect(response.status).toBe(200);const restored=await response.json();expect(restored.issues[0].title).toBe("Legacy task");expect(restored.draft.title).toBe("Legacy draft");expect(restored.chats[0].title).toBe("Legacy chat");}finally{await close(restarted.server);}
}));
test("repositories refuse a different workspace identity even when the account matches",async()=>{
  const request:typeof fetch=async()=>new Response("{}",{status:200,headers:{"Content-Type":"application/json","X-Replica-Account":"alice","X-Replica-Workspace":"other"}});
  await expect(new RemoteRepository(request,"alice","chosen").load()).rejects.toMatchObject({status:403});
});
test("an invitation requires a separate one-use code and exposes only its hash at rest",async()=>fixture(async(origin,database)=>{
  const a=client(origin),b=client(origin),owner=await (await a.register()).json();await b.register("bob@example.test");
  const created=await (await a.request("/api/invitations",{method:"POST",body:JSON.stringify({email:"bob@example.test"})})).json();
  const pending=await (await b.request("/api/workspaces")).json();expect(pending.invitations[0].id).toBe(created.id);expect(JSON.stringify(pending)).not.toContain(created.code);
  const accept=(code:string)=>b.request(`/api/invitations/${created.id}/accept`,{method:"POST",body:JSON.stringify({code})});
  expect((await accept("".padStart(48,"0"))).status).toBe(403);
  const db=new DatabaseSync(database);const row=db.prepare("SELECT code_hash FROM workspace_invitations WHERE id=?").get(created.id)!;expect(row.code_hash).not.toBe(created.code);expect(String(row.code_hash)).toHaveLength(64);db.close();
  expect((await b.request("/api/workspace",{headers:{"X-Replica-Workspace":owner.user.id}})).status).toBe(403);
  expect((await accept(created.code)).status).toBe(200);expect((await accept(created.code)).status).toBe(404);
}));
test("subscriptions and notification read state are personal and other members' task changes reach subscribed inboxes",async()=>fixture(async origin=>{
  const {a,b,workspaceId}=await joinWorkspace(origin),ra=new RemoteRepository(a.request,undefined,workspaceId),rb=new RemoteRepository(b.request,undefined,workspaceId);
  const base=await ra.load(),owner=new Workspace(base),issue=owner.createIssue({title:"Follow this"});await ra.commit(owner.getSnapshot(),base);
  const bobBase=await rb.load(),bob=new Workspace(bobBase);expect(bobBase.issues[0].subscribed).toBe(false);bob.updateIssue(issue.id,{subscribed:true});await rb.commit(bob.getSnapshot(),bobBase);
  const aliceBase=await ra.load(),alice=new Workspace(aliceBase);alice.updateIssue(issue.id,{title:"Changed by Alice"},"updated title");await ra.commit(alice.getSnapshot(),aliceBase);
  const notified=await rb.load(),notification=notified.inbox.find(item=>item.text==="updated title");expect(notification?.read).toBe(false);
  const reading=new Workspace(notified);reading.mutate(d=>{d.inbox.find(item=>item.id===notification!.id)!.read=true;d.issues[0].subscribed=false;});await rb.commit(reading.getSnapshot(),notified);
  expect((await ra.load()).inbox.some(item=>item.id===notification!.id)).toBe(false);
  const before=await ra.load(),again=new Workspace(before);again.updateIssue(issue.id,{priority:2},"updated priority");await ra.commit(again.getSnapshot(),before);
  const after=await rb.load();expect(after.inbox.some(item=>item.text==="updated priority")).toBe(false);expect(after.inbox.find(item=>item.id===notification!.id)?.read).toBe(true);
}));
test("issue identifier reservations are per team prefix and desktop Bearer sessions work across replica origin",async()=>fixture(async origin=>{
  const c=client(origin);const created=await (await c.register()).json();expect(typeof created.token).toBe("string");
  const repo=new RemoteRepository(c.request),base=await repo.load(),w=new Workspace(base);
  w.createTeam({key:"ENG",name:"Engineering"});
  const first=w.createIssue({title:"Default team",teamKey:"XXH"});const second=w.createIssue({title:"Engineering",teamKey:"ENG"});
  expect(first.id.startsWith("XXH-")).toBe(true);expect(second.id.startsWith("ENG-")).toBe(true);
  await repo.commit(w.getSnapshot(),base);
  const range=await (await c.request("/api/issue-identifiers",{method:"POST",body:JSON.stringify({prefix:"ENG"})})).json();
  expect(range.prefix).toBe("ENG");expect(range.start).toBeGreaterThan(1);
  const token=created.token as string;
  const bearer=await fetch(`${origin}/api/session`,{headers:{Authorization:`Bearer ${token}`}});
  expect((await bearer.json()).user.email).toBe("qa@example.test");
  const preflight=await fetch(`${origin}/api/workspace`,{method:"OPTIONS",headers:{Origin:"replica://app","Access-Control-Request-Headers":"Authorization, Content-Type, X-Replica-Client"}});
  expect(preflight.status).toBe(204);expect(preflight.headers.get("access-control-allow-origin")).toBe("replica://app");
  const cross=await fetch(`${origin}/api/workspace`,{headers:{Authorization:`Bearer ${token}`,Origin:"replica://app","X-Replica-Client":"1"}});
  expect(cross.status).toBe(200);expect(cross.headers.get("access-control-allow-origin")).toBe("replica://app");
}));
test("revision pushes reach a different member account in the selected workspace",async()=>fixture(async origin=>{
  const {a,b,workspaceId,memberId}=await joinWorkspace(origin),controller=new AbortController();
  const events=await b.request(`/api/events?workspace=${workspaceId}&account=${memberId}`,{signal:controller.signal}),reader=events.body!.getReader();await reader.read();const pushed=reader.read();
  const repo=new RemoteRepository(a.request),base=await repo.load(),w=new Workspace(base);w.createIssue({title:"Shared live update"});await repo.commit(w.getSnapshot(),base);
  expect(new TextDecoder().decode((await pushed).value)).toContain("data: 1");controller.abort();await reader.cancel().catch(()=>{});
}));
test("only admins paste GitHub tokens and members see a redacted Connection",async()=>fixture(async origin=>{
  const {a,b,workspaceId}=await joinWorkspace(origin),headers={"X-Replica-Workspace":workspaceId};
  const original=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    if(String(input)==="https://api.github.com/user")return new Response(JSON.stringify({login:"octocat"}),{status:200,headers:{"Content-Type":"application/json"}});
    return original(input,init);
  };
  try {
    expect((await b.request("/api/connections/github",{method:"PUT",headers,body:JSON.stringify({token:"ghp_test",repos:["acme/app"]})})).status).toBe(403);
    expect((await a.request("/api/connections/github",{method:"PUT",headers,body:JSON.stringify({token:"ghp_test",repos:["acme/app"]})})).status).toBe(200);
    const status=await (await b.request("/api/connections",{headers})).json();
    expect(status.github).toEqual({connected:true,repos:["acme/app"],login:"octocat"});
    expect(JSON.stringify(status)).not.toContain("ghp_test");
  } finally { globalThis.fetch=original; }
}));
test("admins paste, rotate and disconnect Connections while members see redacted status",async()=>fixture(async origin=>{
  const {a,b,workspaceId}=await joinWorkspace(origin),headers={"X-Replica-Workspace":workspaceId};
  const original=globalThis.fetch,githubCalls:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.startsWith("https://api.github.com")){
      githubCalls.push(`${init?.method??"GET"} ${url}`);
      const token=new Headers(init?.headers).get("Authorization")??"";
      if(url==="https://api.github.com/user")return new Response(JSON.stringify({login:token.includes("ghp_rotated")?"mona":"octocat"}),{headers:{"Content-Type":"application/json"}});
      throw new Error(`unexpected GitHub ${url}`);
    }
    return original(input,init);
  };
  try {
    expect((await a.request("/api/connections/github",{method:"PUT",headers,body:JSON.stringify({token:"",repos:[]})})).status).toBe(400);
    expect((await b.request("/api/connections/github",{method:"PUT",headers,body:JSON.stringify({token:"ghp_test",repos:["acme/app"]})})).status).toBe(403);
    expect((await b.request("/api/connections/model",{method:"PUT",headers,body:JSON.stringify({apiKey:"sk-secret",baseUrl:"https://api.openai.com/v1",model:"gpt-4"})})).status).toBe(403);
    const cwd=mkdtempSync(path.join(tmpdir(),"yunjing-coding-conn-"));
    expect((await b.request("/api/connections/coding",{method:"PUT",headers,body:JSON.stringify({argv:["tool"],cwd})})).status).toBe(403);
    const github=await a.request("/api/connections/github",{method:"PUT",headers,body:JSON.stringify({token:"ghp_test",repos:["acme/app"]})});
    expect(github.status).toBe(200);expect(await github.json()).toMatchObject({github:{connected:true,repos:["acme/app"],login:"octocat"}});
    const githubRotated=await a.request("/api/connections/github",{method:"PUT",headers,body:JSON.stringify({token:"ghp_rotated",repos:["acme/web"]})});
    expect(githubRotated.status).toBe(200);expect(await githubRotated.json()).toMatchObject({github:{connected:true,repos:["acme/web"],login:"mona"}});
    const model=await a.request("/api/connections/model",{method:"PUT",headers,body:JSON.stringify({apiKey:"sk-secret",baseUrl:"https://api.openai.com/v1",model:"gpt-4"})});
    expect(model.status).toBe(200);expect(await model.json()).toMatchObject({model:{connected:true,baseUrl:"https://api.openai.com/v1",model:"gpt-4"}});
    const modelRotated=await a.request("/api/connections/model",{method:"PUT",headers,body:JSON.stringify({apiKey:"sk-rotated",baseUrl:"https://models.example/v1"})});
    expect(modelRotated.status).toBe(200);expect(await modelRotated.json()).toMatchObject({model:{connected:true,baseUrl:"https://models.example/v1"}});
    expect((await a.request("/api/connections/coding",{method:"PUT",headers,body:JSON.stringify({argv:["tool"],cwd:"relative"})})).status).toBe(400);
    const coding=await a.request("/api/connections/coding",{method:"PUT",headers,body:JSON.stringify({argv:[process.execPath,"{issueId}"],cwd})});
    expect(coding.status).toBe(200);expect(await coding.json()).toMatchObject({coding:{configured:true,argv:[process.execPath,"{issueId}"],cwd}});
    const codingRotated=await a.request("/api/connections/coding",{method:"PUT",headers,body:JSON.stringify({argv:["rotated"],cwd})});
    expect(codingRotated.status).toBe(200);expect(await codingRotated.json()).toMatchObject({coding:{configured:true,argv:["rotated"],cwd}});
    const status=await (await b.request("/api/connections",{headers})).json();
    expect(status.github).toEqual({connected:true,repos:["acme/web"],login:"mona"});
    expect(status.model).toEqual({connected:true,baseUrl:"https://models.example/v1"});
    expect(status.coding).toMatchObject({configured:true,argv:["rotated"],cwd});
    const leaked=JSON.stringify(status)+JSON.stringify(await (await b.request("/api/workspace",{headers})).json());
    expect(leaked).not.toContain("ghp_test");expect(leaked).not.toContain("ghp_rotated");expect(leaked).not.toContain("sk-secret");expect(leaked).not.toContain("sk-rotated");
    expect(githubCalls.every(line=>line==="GET https://api.github.com/user")).toBe(true);
    expect(githubCalls.some(line=>/check/i.test(line))).toBe(false);
    expect((await b.request("/api/connections/github",{method:"DELETE",headers})).status).toBe(403);
    expect((await b.request("/api/connections/model",{method:"DELETE",headers})).status).toBe(403);
    expect((await b.request("/api/connections/coding",{method:"DELETE",headers})).status).toBe(403);
    expect((await a.request("/api/connections/github",{method:"DELETE",headers})).status).toBe(200);
    expect((await a.request("/api/connections/model",{method:"DELETE",headers})).status).toBe(200);
    expect((await a.request("/api/connections/coding",{method:"DELETE",headers})).status).toBe(200);
    const empty=await (await b.request("/api/connections",{headers})).json();
    expect(empty.github).toEqual({connected:false,repos:[]});
    expect(empty.model).toEqual({connected:false});
    expect(empty.coding).toEqual({configured:false});
  } finally { globalThis.fetch=original; }
}));
test("GitHub Review sync stores a pull-request projection and refuses repos outside the allow list",async()=>fixture(async origin=>{
  const c=client(origin);await c.register();
  const original=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url==="https://api.github.com/user")return new Response(JSON.stringify({login:"octocat"}),{headers:{"Content-Type":"application/json"}});
    if(url.endsWith("/pulls/41"))return new Response(JSON.stringify({title:"Fix",user:{login:"octocat"},html_url:"https://github.com/acme/app/pull/41",merged:false,draft:false,state:"open",head:{sha:"abc"}}),{headers:{"Content-Type":"application/json"}});
    if(url.endsWith("/files"))return new Response(JSON.stringify([{filename:"src/a.ts",status:"modified",patch:"+ok"}]),{headers:{"Content-Type":"application/json"}});
    if(url.endsWith("/comments"))return new Response(JSON.stringify([{id:9,user:{login:"octocat"},body:"looks good",created_at:"2026-11-19T00:00:00Z"}]),{headers:{"Content-Type":"application/json"}});
    if(url.includes("/status"))return new Response(JSON.stringify({statuses:[{context:"ci",state:"success"}]}),{headers:{"Content-Type":"application/json"}});
    if(url.includes("/actions/runs"))return new Response(JSON.stringify({workflow_runs:[{name:"Tests",conclusion:"success",head_sha:"abc"}]}),{headers:{"Content-Type":"application/json"}});
    return original(input,init);
  };
  try {
    expect((await c.request("/api/connections/github",{method:"PUT",body:JSON.stringify({token:"ghp_test",repos:["acme/app"]})})).status).toBe(200);
    expect((await c.request("/api/reviews/sync",{method:"POST",body:JSON.stringify({url:"https://github.com/other/app/pull/1"})})).status).toBe(403);
    const synced=await c.request("/api/reviews/sync",{method:"POST",body:JSON.stringify({url:"https://github.com/acme/app/pull/41"})});
    expect(synced.status).toBe(200);
    const reviews=await synced.json();
    expect(reviews[0]).toMatchObject({title:"Fix",github:{owner:"acme",repo:"app",number:41}});
    expect(reviews[0].diff).toContain("+ok");
    expect(reviews[0].checks.some((item:{name:string})=>item.name==="ci"||item.name==="Tests")).toBe(true);
  } finally { globalThis.fetch=original; }
}));
function githubFetch(original:typeof fetch, calls:string[]) {
  return async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    calls.push(`${init?.method??"GET"} ${url}`);
    if(url==="https://api.github.com/user")return new Response(JSON.stringify({login:"octocat"}),{headers:{"Content-Type":"application/json"}});
    if(url.endsWith("/pulls/41")&&(!init?.method||init.method==="GET"))return new Response(JSON.stringify({title:"Fix",user:{login:"octocat"},html_url:"https://github.com/acme/app/pull/41",merged:url.includes("unused"),draft:false,state:"open",head:{sha:"abc"}}),{headers:{"Content-Type":"application/json"}});
    if(url.endsWith("/files"))return new Response(JSON.stringify([{filename:"src/a.ts",status:"modified",patch:"+ok"}]),{headers:{"Content-Type":"application/json"}});
    if(url.endsWith("/comments")&&(!init?.method||init.method==="GET"))return new Response(JSON.stringify([]),{headers:{"Content-Type":"application/json"}});
    if(url.endsWith("/comments")&&init?.method==="POST")return new Response(JSON.stringify({id:11,user:{login:"octocat"},body:"ship it",created_at:"2026-11-19T00:00:00Z"}),{headers:{"Content-Type":"application/json"}});
    if(url.includes("/status"))return new Response(JSON.stringify({statuses:[]}),{headers:{"Content-Type":"application/json"}});
    if(url.includes("/actions/runs"))return new Response(JSON.stringify({workflow_runs:[]}),{headers:{"Content-Type":"application/json"}});
    if(url.endsWith("/merge")&&init?.method==="PUT")return new Response(JSON.stringify({merged:true,sha:"def"}),{headers:{"Content-Type":"application/json"}});
    if(url.endsWith("/reviews")&&init?.method==="POST")return new Response(JSON.stringify({id:1}),{headers:{"Content-Type":"application/json"}});
    return original(input,init);
  };
}
test("GitHub merge waits for Confirmation and still reaches a member without a personal snapshot",async()=>fixture(async origin=>{
  const {a,b,workspaceId}=await joinWorkspace(origin),headers={"X-Replica-Workspace":workspaceId};
  const original=globalThis.fetch,calls:string[]=[];
  globalThis.fetch=githubFetch(original,calls);
  try {
    expect((await a.request("/api/connections/github",{method:"PUT",headers,body:JSON.stringify({token:"ghp_test",repos:["acme/app"]})})).status).toBe(200);
    expect((await a.request("/api/reviews/sync",{method:"POST",headers,body:JSON.stringify({url:"https://github.com/acme/app/pull/41"})})).status).toBe(200);
    const reviewId=(await (await a.request("/api/workspace",{headers})).json()).reviews[0].id as string;
    const merge=await a.request(`/api/reviews/${reviewId}/transition`,{method:"POST",headers,body:JSON.stringify({action:"merge"})});
    expect(merge.status).toBe(200);expect(await merge.json()).toMatchObject({pending:true});
    expect(calls.some(line=>line.startsWith("PUT ")&&line.endsWith("/merge"))).toBe(false);
    const confirmation=(await (await b.request("/api/workspace",{headers})).json()).inbox.find((item:{kind?:string})=>item.kind==="confirmation");
    expect(confirmation.confirmation).toMatchObject({action:"merge",reviewId});
    expect((await b.request(`/api/inbox/${confirmation.id}/confirm`,{method:"POST",headers})).status).toBe(200);
    expect(calls.some(line=>line.startsWith("PUT ")&&line.endsWith("/merge"))).toBe(true);
    const alice=(await (await a.request("/api/workspace",{headers})).json()).inbox.find((item:{id:string})=>item.id===confirmation.id);
    expect(alice.archivedAt).toBeTruthy();
  } finally { globalThis.fetch=original; }
}));
test("Agent replies 409 without a model and a coding Loop Confirmation runs the host argv",async()=>fixture(async origin=>{
  const {a,workspaceId}=await joinWorkspace(origin),headers={"X-Replica-Workspace":workspaceId};
  expect((await a.request("/api/agent/reply",{method:"POST",headers,body:JSON.stringify({text:"summarize"})})).status).toBe(409);
  expect((await a.request("/api/connections/model",{method:"PUT",headers,body:JSON.stringify({apiKey:"k",baseUrl:"notaurl"})})).status).toBe(400);
  const cwd=mkdtempSync(path.join(tmpdir(),"yunjing-coding-ui-"));
  expect((await a.request("/api/connections/coding",{method:"PUT",headers,body:JSON.stringify({argv:[process.execPath,"-e","process.stdout.write('ok')"],cwd})})).status).toBe(200);
  const repo=new RemoteRepository(a.request,undefined,workspaceId),base=await repo.load(),w=new Workspace(base);
  w.mutate(d=>{d.loops=[{id:"code",name:"Autofix",prompt:"",category:"Engineering",trigger:"manual",action:"coding-session",enabled:true}];d.runs=[];});
  w.createIssue({title:"bug",status:"triage"});
  await repo.commit(w.getSnapshot(),base);
  const ran=await a.request("/api/loops/code/run",{method:"POST",headers});
  expect(ran.status).toBe(200);expect(await ran.json()).toMatchObject({pending:true});
  const confirmation=(await (await a.request("/api/workspace",{headers})).json()).inbox.find((item:{kind?:string})=>item.kind==="confirmation");
  expect(confirmation.confirmation.action).toBe("coding-session");
  expect((await a.request(`/api/inbox/${confirmation.id}/confirm`,{method:"POST",headers})).status).toBe(200);
  const after=await (await a.request("/api/workspace",{headers})).json();
  expect(after.codingSessions[0].log).toBe("ok");
  expect(after.runs[0].status).toBe("completed");
}));
test("tickWorkspaceRow auto-creates Cycles and rolls incomplete Issues for a signed-in workspace",async()=>fixture(async(origin,database)=>{
  const c=client(origin),created=await (await c.register()).json(),workspaceId=created.user.id as string;
  const repo=new RemoteRepository(c.request),base=await repo.load(),w=new Workspace(base);
  w.updateTeam("XXH",{cycleDurationDays:7,triageAcceptStatus:"todo",triageRotation:["Ada","Bea"]});
  const templateId=w.saveIssueTemplate("Need assignee",{...w.getSnapshot().draft,title:"From template"},undefined,{required:["assignee"]});
  w.mutate(d=>{
    d.cycles=[{id:"c-ended",number:1,name:"Cycle 1",startDate:"2026-11-09",endDate:"2026-11-15",capacity:8,description:"",teamKey:"XXH"}];
    d.loops=[];d.runs=[];
  });
  const review=w.createIssue({title:"carry",cycleId:"c-ended",status:"review"});
  const done=w.createIssue({title:"kept",cycleId:"c-ended",status:"done"});
  const triage=w.createIssue({title:"inbox",status:"triage"});
  await repo.commit(w.getSnapshot(),base);
  const db=new DatabaseSync(database);
  await tickWorkspaceRow(db,workspaceId,new Date("2026-11-16T12:00:00"));
  db.close();
  const after=await repo.load();
  const current=after.cycles.find(cycle=>cycle.startDate==="2026-11-16"&&cycle.endDate==="2026-11-22");
  expect(current).toBeTruthy();
  expect(after.issues.find(issue=>issue.id===review.id)?.cycleId).toBe(current!.id);
  expect(after.issues.find(issue=>issue.id===done.id)?.cycleId).toBe("c-ended");
  const hosted=new Workspace(after);
  hosted.triage(triage.id,"accept");
  expect(hosted.getSnapshot().issues.find(issue=>issue.id===triage.id)).toMatchObject({status:"todo",assignee:"Ada"});
  expect(()=>hosted.createIssue({title:"From template",templateId})).toThrow(/assignee/);
  expect(hosted.createIssue({title:"From template",templateId,assignee:"Ada"}).assignee).toBe("Ada");
}));
test("hosted interval Loops tick once per period and retry a failed run after five minutes",async()=>fixture(async(origin,database)=>{
  const c=client(origin),created=await c.register(),workspaceId=(await created.json()).user.id as string;
  const repo=new RemoteRepository(c.request),base=await repo.load(),w=new Workspace(base);
  const failedAt=new Date(2026,10,19,10,0,0);
  w.mutate(d=>{
    d.loops=[{id:"daily",name:"Daily",prompt:"",category:"Reporting",trigger:"daily",action:"summarize",enabled:true},{id:"retry",name:"Retry",prompt:"",category:"Reporting",trigger:"daily",action:"summarize",enabled:true},{id:"hourly",name:"Hourly",prompt:"",category:"Reporting",trigger:"hourly",action:"summarize",enabled:true}];
    d.runs=[{id:"r-fail",loopId:"retry",time:failedAt.toISOString(),status:"failed",result:"boom",issueIds:[],periodStart:"2026-11-19"}];
  });
  await repo.commit(w.getSnapshot(),base);
  const db=new DatabaseSync(database);
  await tickWorkspaceRow(db,workspaceId,new Date(failedAt.getTime()+60_000));
  const first=await repo.load();
  expect(first.runs.filter(run=>run.loopId==="daily")).toHaveLength(1);
  expect(first.runs.filter(run=>run.loopId==="hourly")).toHaveLength(1);
  expect(first.runs.filter(run=>run.loopId==="retry")).toHaveLength(1);
  expect(first.runs.find(run=>run.loopId==="daily")?.periodStart).toBe("2026-11-19");
  expect(first.inbox.some(item=>item.kind==="confirmation")).toBe(false);
  await tickWorkspaceRow(db,workspaceId,new Date(failedAt.getTime()+6*60_000));
  const second=await repo.load();
  expect(second.runs.filter(run=>run.loopId==="daily")).toHaveLength(1);
  expect(second.runs.filter(run=>run.loopId==="hourly")).toHaveLength(1);
  expect(second.runs.filter(run=>run.loopId==="retry")).toHaveLength(2);
  db.close();
}));

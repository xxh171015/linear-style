import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { WorkspaceData } from "../src/workspace";

export type Role="admin"|"member";
export class HTTPError extends Error { status:number; constructor(status:number,message:string){super(message);this.status=status;} }
type Wire=Omit<WorkspaceData,"attachments">&{attachments:Record<string,unknown>[]};
const personalKeys=["inbox","chats","draft","preferences","projectPreferences","favorites"] as const;
function split(data:Wire) {
  const privateOwners=new Set(["draft","agent-draft",...data.chats.map(chat=>chat.id)]);
  const personal:Record<string,unknown>={};
  for(const key of personalKeys)personal[key]=data[key];
  personal.attachments=data.attachments.filter(file=>privateOwners.has(String(file.ownerId)));
  personal.settings={weekStartsOn:data.settings.weekStartsOn,desktopNotifications:data.settings.desktopNotifications,currentTeamKey:data.settings.currentTeamKey};
  personal.issueSubscriptions=data.issues.filter(issue=>issue.subscribed).map(issue=>issue.id);
  const shared={...data,attachments:data.attachments.filter(file=>!privateOwners.has(String(file.ownerId))),settings:{workspace:data.settings.workspace}} as unknown as Record<string,unknown>;
  shared.issues=data.issues.map(({subscribed:_,...issue})=>issue);
  for(const key of personalKeys)delete shared[key];
  return {shared,personal};
}
function blankPersonal() {return {inbox:[],chats:[],draft:{title:"",body:"",status:"backlog",priority:0,labels:[]},preferences:{},projectPreferences:{},favorites:[],attachments:[],issueSubscriptions:[],settings:{weekStartsOn:1,currentTeamKey:"XXH"}};}

/** The legacy workspaces.user_id column is retained as a stable workspace ID. */
export function workspaceService(db:DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_members(workspace_id TEXT NOT NULL REFERENCES workspaces(user_id),user_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL CHECK(role IN ('admin','member')),joined_at TEXT NOT NULL,PRIMARY KEY(workspace_id,user_id));
    CREATE TABLE IF NOT EXISTS workspace_personal(workspace_id TEXT NOT NULL,user_id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(workspace_id,user_id),FOREIGN KEY(workspace_id) REFERENCES workspaces(user_id),FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS workspace_invitations(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(user_id),email TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','member')),created_at TEXT NOT NULL,expires_at INTEGER NOT NULL,code_hash TEXT,UNIQUE(workspace_id,email));`);
  if(!db.prepare("PRAGMA table_info(workspace_invitations)").all().some(column=>column.name==="code_hash"))db.exec("ALTER TABLE workspace_invitations ADD COLUMN code_hash TEXT");
  db.prepare("DELETE FROM workspace_invitations WHERE code_hash IS NULL").run();
  if(db.prepare("PRAGMA foreign_key_list(workspace_personal)").all().some(row=>row.on_delete==="CASCADE"))db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE workspace_personal_retained(workspace_id TEXT NOT NULL REFERENCES workspaces(user_id),user_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,PRIMARY KEY(workspace_id,user_id));
    INSERT INTO workspace_personal_retained SELECT * FROM workspace_personal;
    DROP TABLE workspace_personal;
    ALTER TABLE workspace_personal_retained RENAME TO workspace_personal; COMMIT;`);
  for(const row of db.prepare("SELECT p.workspace_id,p.user_id,p.data,w.data AS shared FROM workspace_personal p JOIN workspaces w ON w.user_id=p.workspace_id").all()) {
    const personal=JSON.parse(String(row.data));
    if(!Array.isArray(personal.issueSubscriptions)){
      personal.issueSubscriptions=(JSON.parse(String(row.shared)).issues as WorkspaceData["issues"]).filter(issue=>issue.subscribed).map(issue=>issue.id);
      db.prepare("UPDATE workspace_personal SET data=? WHERE workspace_id=? AND user_id=?").run(JSON.stringify(personal),String(row.workspace_id),String(row.user_id));
    }
  }
  const hashCode=(code:string)=>createHash("sha256").update(code).digest();
  function initialize(id:string) {
    const row=db.prepare("SELECT data FROM workspaces WHERE user_id=?").get(id) as {data:string};
    const {shared,personal}=split(JSON.parse(row.data));
    db.prepare("INSERT INTO workspace_members VALUES(?,?,?,?)").run(id,id,"admin",new Date().toISOString());
    db.prepare("INSERT INTO workspace_personal VALUES(?,?,?)").run(id,id,JSON.stringify(personal));
    db.prepare("UPDATE workspaces SET data=? WHERE user_id=?").run(JSON.stringify(shared),id);
  }
  // Preserve existing accounts and their private drafts/conversations on upgrade.
  db.exec("BEGIN IMMEDIATE");
  try{for(const row of db.prepare("SELECT user_id FROM workspaces WHERE NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=workspaces.user_id)").all())initialize(String(row.user_id));db.exec("COMMIT");}
  catch(error){db.exec("ROLLBACK");throw error;}
  function membership(workspaceId:string,userId:string) {
    const row=db.prepare("SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?").get(workspaceId,userId) as {role:Role}|undefined;
    if(!row)throw new HTTPError(403,"You no longer have access to this workspace. Choose another workspace in Settings.");return row;
  }
  function admin(workspaceId:string,userId:string){if(membership(workspaceId,userId).role!=="admin")throw new HTTPError(403,"Only workspace admins can manage members and invitations.");}
  function summary(userId:string,email:string) {
    const workspaces=db.prepare("SELECT w.user_id AS id,w.data,m.role FROM workspace_members m JOIN workspaces w ON w.user_id=m.workspace_id WHERE m.user_id=? ORDER BY m.joined_at,w.user_id").all(userId).map(row=>({id:String(row.id),name:JSON.parse(String(row.data)).settings.workspace as string,role:row.role as Role}));
    const invitations=db.prepare("SELECT i.id,i.workspace_id,i.role,i.created_at,i.expires_at,w.data FROM workspace_invitations i JOIN workspaces w ON w.user_id=i.workspace_id WHERE i.email=? AND i.expires_at>? ORDER BY i.created_at DESC").all(email,Date.now()).map(row=>({id:row.id,workspaceId:row.workspace_id,workspace:JSON.parse(String(row.data)).settings.workspace,role:row.role,createdAt:row.created_at,expiresAt:row.expires_at}));
    return {workspaces,invitations};
  }
  function read(workspaceId:string,user:{id:string;name:string}) {
    membership(workspaceId,user.id);
    const row=db.prepare("SELECT data,revision FROM workspaces WHERE user_id=?").get(workspaceId) as {data:string;revision:number};
    const privateRow=db.prepare("SELECT data FROM workspace_personal WHERE workspace_id=? AND user_id=?").get(workspaceId,user.id) as {data:string}|undefined;
    const shared=JSON.parse(row.data),personal=privateRow?JSON.parse(privateRow.data):blankPersonal();
    const {issueSubscriptions=[],...fields}=personal;
    return {...shared,...fields,revision:row.revision,issues:shared.issues.map((issue:WorkspaceData["issues"][number])=>({...issue,subscribed:issueSubscriptions.includes(issue.id)})),attachments:[...shared.attachments,...personal.attachments],settings:{...shared.settings,...personal.settings,user:user.name}} as Wire;
  }
  function write(workspaceId:string,userId:string,expected:number,data:Wire) {
    const role=membership(workspaceId,userId).role;
    const row=db.prepare("SELECT data FROM workspaces WHERE user_id=?").get(workspaceId) as {data:string};
    if(role!=="admin"&&data.settings.workspace!==JSON.parse(row.data).settings.workspace)throw new HTTPError(403,"Only workspace admins can rename the workspace.");
    const {shared,personal}=split(data);
    db.exec("BEGIN IMMEDIATE");
    try {
      const updated=db.prepare("UPDATE workspaces SET revision=?,data=? WHERE user_id=? AND revision=?").run(expected+1,JSON.stringify({...shared,revision:expected+1}),workspaceId,expected);
      if(updated.changes!==1)throw new HTTPError(409,"The workspace changed in another session. Retry with the latest version.");
      db.prepare("INSERT INTO workspace_personal VALUES(?,?,?) ON CONFLICT(workspace_id,user_id) DO UPDATE SET data=excluded.data").run(workspaceId,userId,JSON.stringify(personal));
      const known=new Set((JSON.parse(row.data).activity as WorkspaceData["activity"]).map(item=>item.id));
      const added=data.activity.filter(item=>!known.has(item.id));
      for(const other of db.prepare("SELECT p.user_id,p.data FROM workspace_personal p JOIN workspace_members m ON m.workspace_id=p.workspace_id AND m.user_id=p.user_id WHERE p.workspace_id=? AND p.user_id<>?").all(workspaceId,userId)) {
        const stored=JSON.parse(String(other.data));
        const notifications=added.filter(event=>stored.issueSubscriptions?.includes(event.issueId)).map(event=>({id:`notification-${randomBytes(16).toString("hex")}`,issueId:event.issueId,text:event.text,time:event.time,read:false}));
        if(notifications.length){stored.inbox.unshift(...notifications);db.prepare("UPDATE workspace_personal SET data=? WHERE workspace_id=? AND user_id=?").run(JSON.stringify(stored),workspaceId,String(other.user_id));}
      }
      db.exec("COMMIT");
    }catch(error){db.exec("ROLLBACK");throw error;}
  }
  function roster(workspaceId:string,userId:string) {
    const {role}=membership(workspaceId,userId);
    const members=db.prepare("SELECT u.id,u.name,u.email,m.role,m.joined_at AS joinedAt FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY u.name,u.id").all(workspaceId);
    const invitations=role==="admin"?db.prepare("SELECT id,email,role,created_at AS createdAt,expires_at AS expiresAt FROM workspace_invitations WHERE workspace_id=? AND expires_at>? ORDER BY created_at DESC").all(workspaceId,Date.now()):[];
    return {members,invitations};
  }
  function invite(workspaceId:string,userId:string,input:{email?:unknown;role?:unknown}) {
    admin(workspaceId,userId);
    const email=typeof input.email==="string"?input.email.trim().toLowerCase():"",role=input.role??"member";
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!["admin","member"].includes(String(role)))throw new HTTPError(400,"Enter a valid email and role.");
    if(db.prepare("SELECT 1 FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND u.email=?").get(workspaceId,email))throw new HTTPError(409,"This person is already a member.");
    const id=randomBytes(16).toString("hex"),code=randomBytes(24).toString("hex");
    db.prepare("INSERT INTO workspace_invitations(id,workspace_id,email,role,created_at,expires_at,code_hash) VALUES(?,?,?,?,?,?,?) ON CONFLICT(workspace_id,email) DO UPDATE SET id=excluded.id,role=excluded.role,created_at=excluded.created_at,expires_at=excluded.expires_at,code_hash=excluded.code_hash").run(id,workspaceId,email,String(role),new Date().toISOString(),Date.now()+7*86400000,hashCode(code).toString("hex"));
    return {id,code};
  }
  function accept(id:string,user:{id:string;email:string},code:unknown) {
    const invitation=db.prepare("SELECT workspace_id,role,code_hash FROM workspace_invitations WHERE id=? AND email=? AND expires_at>?").get(id,user.email,Date.now()) as {workspace_id:string;role:Role;code_hash:string}|undefined;
    if(!invitation)throw new HTTPError(404,"This invitation is unavailable or has expired.");
    if(typeof code!=="string"||code.length!==48||!timingSafeEqual(hashCode(code),Buffer.from(invitation.code_hash,"hex")))throw new HTTPError(403,"Enter the invitation code provided by your workspace admin.");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO workspace_members VALUES(?,?,?,?) ON CONFLICT DO NOTHING").run(invitation.workspace_id,user.id,invitation.role,new Date().toISOString());
      db.prepare("DELETE FROM workspace_invitations WHERE id=?").run(id);db.exec("COMMIT");return invitation.workspace_id;
    }catch(error){db.exec("ROLLBACK");throw error;}
  }
  function cancel(workspaceId:string,userId:string,id:string){admin(workspaceId,userId);if(!db.prepare("DELETE FROM workspace_invitations WHERE id=? AND workspace_id=?").run(id,workspaceId).changes)throw new HTTPError(404,"Invitation not found.");}
  function decline(id:string,email:string){if(!db.prepare("DELETE FROM workspace_invitations WHERE id=? AND email=?").run(id,email).changes)throw new HTTPError(404,"Invitation not found.");}
  function updateMember(workspaceId:string,actorId:string,memberId:string,role:Role|undefined) {
    admin(workspaceId,actorId);const target=membership(workspaceId,memberId);
    if(target.role==="admin"&&role!=="admin"&&Number(db.prepare("SELECT count(*) AS n FROM workspace_members WHERE workspace_id=? AND role='admin'").get(workspaceId)!.n)<=1)throw new HTTPError(409,"Keep at least one workspace admin.");
    if(role)db.prepare("UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?").run(role,workspaceId,memberId);
    else db.prepare("DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?").run(workspaceId,memberId);
  }
  return {initialize,membership,admin,summary,read,write,roster,invite,accept,cancel,decline,updateMember};
}

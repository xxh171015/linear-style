import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scrypt, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync, chmodSync, existsSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { workspaceService, HTTPError, type Role } from "./workspaces";
import { TEAM_KEY_PATTERN, initialData } from "../src/workspace";
import { decodeWorkspace, encodeWorkspace } from "../src/workspace-wire";

const hashPassword=promisify(scrypt), digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const ttl=7*86400000;
type User={id:string;email:string;name:string};
export function createReplicaServer({databasePath,staticRoot,publicOrigin}:{databasePath:string;staticRoot?:string;publicOrigin?:string}) {
  if(databasePath!==":memory:"){mkdirSync(path.dirname(databasePath),{recursive:true,mode:0o700});}
  const db=new DatabaseSync(databasePath);
  if(databasePath!==":memory:")chmodSync(databasePath,0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS workspaces(user_id TEXT PRIMARY KEY REFERENCES users(id),revision INTEGER NOT NULL,data TEXT NOT NULL,next_issue INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS issue_sequences(workspace_id TEXT NOT NULL REFERENCES workspaces(user_id),prefix TEXT NOT NULL,next_issue INTEGER NOT NULL,PRIMARY KEY(workspace_id,prefix));`);
  if(!db.prepare("PRAGMA table_info(workspaces)").all().some(column=>column.name==="next_issue"))db.exec("ALTER TABLE workspaces ADD COLUMN next_issue INTEGER NOT NULL DEFAULT 1");
  const spaces=workspaceService(db);
  const streams=new Map<string,Map<ServerResponse,string>>(),rates=new Map<string,{count:number;until:number}>();
  function limit(key:string,max:number) {
    const now=Date.now();for(const [key,value] of rates)if(value.until<now)rates.delete(key);
    const bucket=rates.get(key)??{count:0,until:now+15*60000};
    if(++bucket.count>max)throw new HTTPError(429,"Too many attempts. Try again later.");rates.set(key,bucket);
  }
  function token(req:IncomingMessage){
    const bearer=/^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization??"")?.[1];
    if(bearer)return bearer;
    return /(?:^|;\s*)replica_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie??"")?.[1];
  }
  function requestOrigin(req:IncomingMessage){return publicOrigin??`http://${req.headers.host}`;}
  function corsAllowed(origin:string){
    const self=publicOrigin;
    return origin===self || origin==="replica://app" || origin==="http://127.0.0.1:5174" || origin==="http://localhost:5174" || (!self && /^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin));
  }
  function applyCors(req:IncomingMessage,res:ServerResponse){
    const origin=req.headers.origin;
    if(typeof origin==="string" && corsAllowed(origin)){
      res.setHeader("Access-Control-Allow-Origin",origin);
      res.setHeader("Vary","Origin");
      res.setHeader("Access-Control-Allow-Credentials","true");
      res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization, X-Replica-Client, X-Replica-Account, X-Replica-Workspace");
      res.setHeader("Access-Control-Allow-Methods","GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
    }
  }
  function user(req:IncomingMessage):User {
    const raw=token(req);if(!raw)throw new HTTPError(401,"Sign in to continue.");
    const found=db.prepare("SELECT users.id,users.email,users.name FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?").get(digest(raw),Date.now()) as User|undefined;
    if(!found)throw new HTTPError(401,"Your session has expired. Sign in again.");return found;
  }
  async function body(req:IncomingMessage) {
    if(!req.headers["content-type"]?.startsWith("application/json"))throw new HTTPError(415,"Send JSON data.");
    let bytes=0;const chunks:Buffer[]=[];
    for await(const chunk of req){bytes+=chunk.length;if(bytes>32*1024*1024)throw new HTTPError(413,"Workspace is too large for this server (32 MB). Export a backup before removing large attachments.");chunks.push(chunk);}
    try{const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(!value||typeof value!=="object"||Array.isArray(value))throw Error();return value;}catch{throw new HTTPError(400,"Invalid JSON data.");}
  }
  function respond(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(value));}
  function session(res:ServerResponse,req:IncomingMessage,account:User) {
    const raw=randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(digest(raw),account.id,Date.now()+ttl);
    const secure=publicOrigin?.startsWith("https://")||("encrypted" in req.socket && req.socket.encrypted);
    res.setHeader("Set-Cookie",`replica_session=${raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ttl/1000}${secure?"; Secure":""}`);
    return raw;
  }
  const server=createServer(async(req,res)=>{
    res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Referrer-Policy","same-origin");
    try {
      const url=new URL(req.url??"/","http://localhost"),route=url.pathname,method=req.method;
      if(route.startsWith("/api/")) {
        applyCors(req,res);
        if(method==="OPTIONS"){res.writeHead(204);res.end();return;}
        if(!["GET","HEAD"].includes(method??"")) {
          const origin=req.headers.origin;
          if(req.headers["x-replica-client"]!=="1" || (typeof origin==="string" && origin!==requestOrigin(req) && !corsAllowed(origin)))throw new HTTPError(403,"This request is not from the workspace app.");
        }
        if(route==="/api/session"&&method==="GET") {
          try{return respond(res,200,{configured:true,user:user(req)});}catch(e){if(e instanceof HTTPError&&e.status===401)return respond(res,200,{configured:true,user:null});throw e;}
        }
        if(["/api/auth/register","/api/auth/login"].includes(route)&&method==="POST") {
          limit(`ip:${req.socket.remoteAddress}`,30);
          const input=await body(req),email=typeof input.email==="string"?input.email.trim().toLowerCase():"",password=input.password;
          if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=="string"||password.length>1024)throw new HTTPError(400,"Enter a valid email and password.");
          limit(`email:${email}`,15);
          if(route.endsWith("register")) {
            if(password.length<12)throw new HTTPError(400,"Use a password with at least 12 characters.");
            const name=typeof input.name==="string"?input.name.trim():"",workspace=typeof input.workspace==="string"?input.workspace.trim():"";
            if(!name||name.length>80||!workspace||workspace.length>120)throw new HTTPError(400,"Enter your name and a workspace name.");
            const id=randomBytes(16).toString("hex"),salt=randomBytes(16).toString("hex"),hash=(await hashPassword(password,salt,64)) as Buffer;
            const data=initialData();
            for(const key of ["issues","projects","views","milestones","initiatives","activity","inbox","reviews","attachments","chats","loops","runs","documents","templates","relations","favorites","labels"] as const)data[key]=[];
            data.settings={...data.settings,user:name,workspace};
            const wire=JSON.stringify(await encodeWorkspace(data));
            db.exec("BEGIN IMMEDIATE");
            try{db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(id,email,name,salt,hash.toString("hex"));db.prepare("INSERT INTO workspaces(user_id,revision,data) VALUES(?,?,?)").run(id,0,wire);spaces.initialize(id);db.exec("COMMIT");}
            catch(error){db.exec("ROLLBACK");if(db.prepare("SELECT id FROM users WHERE email=?").get(email))throw new HTTPError(409,"An account with this email already exists. Sign in instead.");throw error;}
            const account={id,email,name};return respond(res,201,{user:account,token:session(res,req,account)});
          }
          const row=db.prepare("SELECT * FROM users WHERE email=?").get(email) as (User&{salt:string;password_hash:string})|undefined;
          const hash=(await hashPassword(password,row?.salt??"invalid-account-salt",64)) as Buffer;
          if(!row||!timingSafeEqual(hash,Buffer.from(row.password_hash,"hex")))throw new HTTPError(401,"Email or password is incorrect.");
          const account={id:row.id,email:row.email,name:row.name};return respond(res,200,{user:account,token:session(res,req,account)});
        }
        const account=user(req);
        res.setHeader("X-Replica-Account",account.id);
        if(req.headers["x-replica-account"]&&req.headers["x-replica-account"]!==account.id)throw new HTTPError(403,"This window belongs to a different account. Reconnect it before saving.");
        if(route==="/api/auth/logout"&&method==="POST") {
          db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token(req)!));res.setHeader("Set-Cookie","replica_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
          return respond(res,200,{ok:true});
        }
        if(route==="/api/workspaces"&&method==="GET")return respond(res,200,spaces.summary(account.id,account.email));
        const invitation=/^\/api\/invitations\/([a-f0-9]{32})(\/accept)?$/.exec(route);
        if(invitation&&invitation[2]&&method==="POST"){limit(`accept:${account.id}`,30);return respond(res,200,{workspaceId:spaces.accept(invitation[1],account,(await body(req)).code)});}
        if(invitation&&!invitation[2]&&method==="DELETE"){spaces.decline(invitation[1],account.email);return respond(res,200,{ok:true});}
        const selected=req.headers["x-replica-workspace"]??(route==="/api/events"?url.searchParams.get("workspace"):null)??account.id;
        if(typeof selected!=="string")throw new HTTPError(400,"Invalid workspace.");
        const expectedAccount=route==="/api/events"?url.searchParams.get("account"):null;
        if(expectedAccount&&expectedAccount!==account.id)throw new HTTPError(403,"Reconnect this account before syncing.");
        spaces.membership(selected,account.id);res.setHeader("X-Replica-Workspace",selected);
        const notify=()=>{for(const [stream] of streams.get(selected)??[])if(!stream.writableEnded&&!stream.destroyed)stream.write("data: changed\n\n");};
        if(route==="/api/members"&&method==="GET")return respond(res,200,spaces.roster(selected,account.id));
        if(route==="/api/invitations"&&method==="POST"){limit(`invite:${account.id}`,30);const invitation=spaces.invite(selected,account.id,await body(req));notify();return respond(res,201,invitation);}
        const cancellation=/^\/api\/workspace-invitations\/([a-f0-9]{32})$/.exec(route);
        if(cancellation&&method==="DELETE"){spaces.cancel(selected,account.id,cancellation[1]);notify();return respond(res,200,{ok:true});}
        const member=/^\/api\/members\/([a-f0-9]{32})$/.exec(route);
        if(member&&(method==="PATCH"||method==="DELETE")) {
          const input=method==="PATCH"?await body(req):null;
          if(input&&!["admin","member"].includes(input.role))throw new HTTPError(400,"Choose Admin or Member.");
          spaces.updateMember(selected,account.id,member[1],input?.role as Role|undefined);
          if(method==="DELETE")for(const [stream,id] of streams.get(selected)??[])if(id===member[1])stream.end();
          notify();return respond(res,200,{ok:true});
        }
        if(route==="/api/workspace"&&method==="GET")return respond(res,200,spaces.read(selected,account));
        if(route==="/api/issue-identifiers"&&method==="POST") {
          const input=await body(req);
          const prefix=typeof input.prefix==="string"?input.prefix.trim().toUpperCase():"XXH";
          if(!TEAM_KEY_PATTERN.test(prefix))throw new HTTPError(400,"Issue identifier prefix is invalid.");
          db.exec("BEGIN IMMEDIATE");
          try {
            const row=db.prepare("SELECT data,next_issue FROM workspaces WHERE user_id=?").get(selected) as {data:string;next_issue:number};
            const issues=JSON.parse(row.data).issues as {id:string}[];
            const observed=issues.reduce((max,issue)=>{const match=new RegExp(`^${prefix}-(\\d+)$`).exec(issue.id);return Math.max(max,match?Number(match[1]):0);},0);
            const sequence=db.prepare("SELECT next_issue FROM issue_sequences WHERE workspace_id=? AND prefix=?").get(selected,prefix) as {next_issue:number}|undefined;
            const fallback=prefix==="XXH"?row.next_issue:1;
            const start=Math.max(sequence?.next_issue??fallback,observed+1),count=16;
            if(!Number.isSafeInteger(start+count))throw Error("Issue identifiers exhausted");
            db.prepare("INSERT INTO issue_sequences(workspace_id,prefix,next_issue) VALUES(?,?,?) ON CONFLICT(workspace_id,prefix) DO UPDATE SET next_issue=excluded.next_issue").run(selected,prefix,start+count);
            if(prefix==="XXH")db.prepare("UPDATE workspaces SET next_issue=? WHERE user_id=?").run(start+count,selected);
            db.exec("COMMIT");return respond(res,200,{prefix,start,count});
          }catch(error){db.exec("ROLLBACK");throw error;}
        }
        if(route==="/api/workspace"&&method==="PUT") {
          const input=await body(req);
          if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)throw new HTTPError(400,"Invalid workspace revision.");
          let next;
          try{next=decodeWorkspace(input.workspace);}catch{throw new HTTPError(400,"Workspace data failed validation.");}
          next.settings.user=account.name;next.revision=input.expectedRevision+1;
          spaces.write(selected,account.id,input.expectedRevision,await encodeWorkspace(next));
          for(const [stream] of streams.get(selected)??[])if(!stream.writableEnded&&!stream.destroyed)stream.write(`data: ${next.revision}\n\n`);
          return respond(res,200,spaces.read(selected,account));
        }
        if(route==="/api/events"&&method==="GET") {
          const set=streams.get(selected)??new Map<ServerResponse,string>();
          if([...set.values()].filter(id=>id===account.id).length>=10)throw new HTTPError(429,"Too many open connections for this account.");
          streams.set(selected,set);set.set(res,account.id);res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-store","Connection":"keep-alive"});res.write(": connected\n\n");
          const timer=setInterval(()=>{try{user(req);spaces.membership(selected,account.id);res.write(": heartbeat\n\n");}catch{res.end();}},20000);
          res.on("close",()=>{clearInterval(timer);set.delete(res);if(!set.size)streams.delete(selected);});return;
        }
        throw new HTTPError(404,"Not found.");
      }
      if(method!=="GET"&&method!=="HEAD")throw new HTTPError(405,"Method not allowed.");
      if(!staticRoot)throw new HTTPError(404,"App files are not available. Run the app build first.");
      let relative:string;try{relative=decodeURIComponent(url.pathname);}catch{throw new HTTPError(400,"Invalid path.");}
      const root=path.resolve(staticRoot),target=path.resolve(root,`.${relative}`);
      if(path.relative(root,target).startsWith("..")||relative.includes("\0"))throw new HTTPError(404,"Not found.");
      const file=existsSync(target)&&statSync(target).isFile()?target:path.join(root,"index.html");
      if(!existsSync(file))throw new HTTPError(404,"App files are not available. Run the app build first.");
      const mime:Record<string,string>={".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2",".png":"image/png",".svg":"image/svg+xml"};
      res.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https: http:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'");
      res.writeHead(200,{"Content-Type":mime[path.extname(file)]??"application/octet-stream","Cache-Control":"no-cache"});res.end(method==="HEAD"?undefined:readFileSync(file));
    } catch(error) {
      if(res.headersSent){res.end();return;}
      respond(res,error instanceof HTTPError?error.status:500,{error:error instanceof HTTPError?error.message:"The server could not complete the request."});
    }
  });
  server.on("close",()=>{for(const set of streams.values())for(const [stream] of set)stream.end();db.close();});
  return server;
}

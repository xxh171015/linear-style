import type { WorkspaceData } from "./workspace";

export class WorkspaceConflict extends Error {
  paths: string[];
  constructor(paths: string[]) {
    super(`Another window changed the same information: ${paths.join(", ")}.`);
    this.name = "WorkspaceConflict"; this.paths = paths;
  }
}
const blobHashes = new WeakMap<Blob, Promise<string>>();
async function hashBlobs(value: unknown): Promise<void> {
  if (value instanceof Blob) {
    if (!blobHashes.has(value)) blobHashes.set(value, value.arrayBuffer().then(bytes => crypto.subtle.digest("SHA-256",bytes)).then(hash => [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("")));
    await blobHashes.get(value); return;
  }
  if (Array.isArray(value)) await Promise.all(value.map(hashBlobs));
  else if (value && typeof value === "object") await Promise.all(Object.values(value).map(hashBlobs));
}
const keyed = (value: unknown): value is {id:string}[] => Array.isArray(value) && value.every(item=>item && typeof item === "object" && typeof item.id === "string");
const record = (value: unknown): value is Record<string,unknown> => !!value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Blob);

/** Three-way merge of immutable snapshots. Unrelated writes are retained; conflicts never silently replace data. */
export async function mergeWorkspace(base:WorkspaceData, local:WorkspaceData, shared:WorkspaceData, preferLocal=false):Promise<WorkspaceData> {
  await Promise.all([base,local,shared].map(hashBlobs));
  const hashes = new WeakMap<Blob,string>();
  async function collect(value:unknown):Promise<void> {
    if(value instanceof Blob) {hashes.set(value,await blobHashes.get(value)!);return;}
    if(Array.isArray(value)) await Promise.all(value.map(collect));
    else if(record(value)) await Promise.all(Object.values(value).map(collect));
  }
  await Promise.all([base,local,shared].map(collect));
  const memo=new WeakMap<object,string>();
  const fingerprint=(value:unknown):string=>{
    if(value instanceof Blob)return `blob:${value.type}:${value.size}:${hashes.get(value)}`;
    if(value===undefined)return "undefined";
    if(value===null||typeof value!=="object")return JSON.stringify(value);
    const cached=memo.get(value);if(cached!==undefined)return cached;
    const result=Array.isArray(value)?`[${value.map(fingerprint).join(",")}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${fingerprint((value as Record<string,unknown>)[key])}`).join(",")}}`;
    memo.set(value,result);return result;
  };
  const equal=(a:unknown,b:unknown)=>a===b||fingerprint(a)===fingerprint(b);
  const conflicts:string[]=[];
  const merge=(before:unknown,ours:unknown,theirs:unknown,path:string):unknown=>{
    if(equal(ours,before))return theirs;
    if(equal(theirs,before)||equal(ours,theirs))return ours;
    if(path==="revision")return shared.revision;
    if(path.endsWith(".updatedAt")||path.endsWith(".lastRunAt")) {
      if(typeof ours==="string"&&typeof theirs==="string")return ours>theirs?ours:theirs;
    }
    if(path==="favorites"&&[before,ours,theirs].every(Array.isArray)) {
      const b=before as string[],o=ours as string[],t=theirs as string[];
      return [...new Set([...t.filter(id=>!b.includes(id)||o.includes(id)),...o.filter(id=>!b.includes(id))])];
    }
    if(keyed(before)&&keyed(ours)&&keyed(theirs)) {
      const b=new Map(before.map(item=>[item.id,item])),o=new Map(ours.map(item=>[item.id,item])),t=new Map(theirs.map(item=>[item.id,item]));
      const ids=[...new Set([...ours.filter(item=>!b.has(item.id)).map(item=>item.id),...theirs.map(item=>item.id),...before.map(item=>item.id)])];
      return ids.map(id=>merge(b.get(id),o.get(id),t.get(id),`${path}.${id}`)).filter(item=>item!==undefined);
    }
    if(record(before)&&record(ours)&&record(theirs)) {
      const result:Record<string,unknown>={};
      for(const key of new Set([...Object.keys(before),...Object.keys(ours),...Object.keys(theirs)])) {
        const value=merge(before[key],ours[key],theirs[key],path?`${path}.${key}`:key);
        if(value!==undefined)result[key]=value;
      }
      return result;
    }
    if(!preferLocal || (before===undefined && record(ours) && record(theirs) && typeof ours.id==="string"))conflicts.push(path);
    return ours;
  };
  const result=merge(base,local,shared,"") as WorkspaceData;
  if(conflicts.length)throw new WorkspaceConflict(conflicts);
  return {...result,revision:shared.revision+1};
}

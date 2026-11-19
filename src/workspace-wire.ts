import { migrateData, type WorkspaceData } from "./workspace";

/** JSON transport shares the existing backup format, including attachment bytes. */
export async function encodeWorkspace(data: WorkspaceData) {
  return {...data,attachments:await Promise.all(data.attachments.map(async item=>({...item,blob:Array.from(new Uint8Array(await item.blob.arrayBuffer()))})))};
}
export function decodeWorkspace(value: unknown): WorkspaceData {
  if(!value || typeof value!=="object")throw Error("Invalid workspace data.");
  const wire=structuredClone(value) as Record<string,unknown>;
  if(!Array.isArray(wire.attachments))throw Error("Invalid attachment data.");
  wire.attachments=wire.attachments.map((item:unknown)=>{
    if(!item || typeof item!=="object")throw Error("Invalid attachment data.");
    const file=item as Record<string,unknown>,bytes=file.blob;
    if(!Array.isArray(bytes)||bytes.some(n=>!Number.isInteger(n)||n<0||n>255))throw Error("Invalid attachment data.");
    return {...file,blob:new Blob([new Uint8Array(bytes)],{type:typeof file.mime==="string"?file.mime:""})};
  });
  return migrateData(wire);
}

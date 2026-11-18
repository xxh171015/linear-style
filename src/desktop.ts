export type DesktopCommand = {type: 'new-tab'|'close-tab'|'reopen-tab'|'new-issue'|'new-project'|'new-initiative'|'new-chat'|'new-document'|'search'|'command'|'back'|'forward'|'settings'|'reload'} | {type:'navigate';route:string};
export type DesktopBridge = {
  platform: string;
  ready:()=>Promise<void>;
  loadSession?:()=>Promise<unknown>;
  saveSession?:(value:unknown)=>Promise<void>;
  setBadge:(count:number)=>Promise<void>;
  notify?:(value:{id:string;title:string;body:string;route:string})=>Promise<boolean>;
  windowAction:(action:'close'|'minimize'|'maximize'|'new-window')=>Promise<void>;
  onCommand:(callback:(command:DesktopCommand)=>void)=>()=>void;
  onCloseRequested:(callback:()=>Promise<void>)=>()=>void;
};
declare global { interface Window {replicaDesktop?: DesktopBridge} }

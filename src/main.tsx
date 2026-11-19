import {
  Component,
  StrictMode,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AccountGate, AccountContext } from "./account-ui";
import { Dialog } from "./ui";
import { WorkspaceAccounts } from "./workspace-members-ui";
import { accountEnabled, accountRequest, discoverServer, RemoteRepository, serverRequest, type AccountSession, type MembershipSummary, type WorkspaceMember } from "./remote-repository";
import {
  IndexedDBRepository,
  Workspace,
  initialData,
  migrateData,
} from "./workspace";
import "./styles.css";
import "./replica.css";
const repository = new IndexedDBRepository();
class RenderBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  render() {
    return this.state.error ? (
      <div className="r-boot" role="alert">
        <h1>Unable to display this page</h1>
        <p>{this.state.error}</p>
        <p>Your saved workspace has not been replaced.</p>
        <button
          onClick={() => {
            window.location.hash = "#/my-issues";
            window.location.reload();
          }}
        >
          Reopen workspace
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Bootstrap() {
  const [account,setAccount]=useState<AccountSession|null>(null);
  const [reconnect,setReconnect]=useState(false);
  const [summary,setSummary]=useState<MembershipSummary>({workspaces:[],invitations:[]});
  const [accessEmpty,setAccessEmpty]=useState(false);
  const [selected,setSelected]=useState(""),[members,setMembers]=useState<WorkspaceMember[]>([]);
  const [initialSession,setInitialSession] = useState<unknown>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");setAccessEmpty(false);
    let loadedWorkspace: Workspace | undefined;
    void (async()=>{
        const account=accountEnabled()?await discoverServer():null;
        if(!active)return;
        setAccount(account);
        if(account&&!account.user){setWorkspace(null);return;}
        let workspaceId="";
        if(account?.user){
          const list:MembershipSummary=await serverRequest("/api/workspaces",{},accountRequest(account.user.id));
          if(!active)return;
          const remembered=sessionStorage.getItem(`replica:workspace:${account.user.id}`);
          workspaceId=list.workspaces.find(item=>item.id===remembered)?.id??list.workspaces[0]?.id??"";
          if(!workspaceId){setSummary(list);setSelected("");setMembers([]);setAccessEmpty(true);return;}
          const roster=await serverRequest("/api/members",{},accountRequest(account.user.id,workspaceId));
          if(!active)return;setSummary(list);setSelected(workspaceId);setMembers(roster.members);
        }
        const storage=account?new RemoteRepository(undefined,account.user!.id,workspaceId):repository;
        const saved=account?await storage.load():await repository.loadOrCreate(initialData());
        const session = await window.replicaDesktop?.loadSession?.().catch(()=>undefined);
        if (active) setInitialSession(session);
        if (active)
          setWorkspace(
            (loadedWorkspace = new Workspace(
              saved === undefined ? initialData() : migrateData(saved),
              storage,
            )),
          );
      })()
      .catch((error) => {
        if (active)
          setError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
      loadedWorkspace?.dispose();
    };
  }, [attempt]);
  if (error)
    return (
      <div className="r-boot">
        <h1>Unable to open your workspace</h1>
        <p>{error}</p>
        <p>Your saved data has not been replaced.</p>
        <button onClick={() => setAttempt(attempt + 1)}>Retry</button>
      </div>
    );
  if(account&&!account.user)return <AccountGate onSignedIn={()=>setAttempt(value=>value+1)}/>;
  const signOut=async()=>{
    await workspace?.flushed();
    if(workspace?.saveState==="error")throw Error("Resolve the save error before signing out. You can export a backup from Settings.");
    await serverRequest("/api/auth/logout",{method:"POST",headers:account?.user?{"X-Replica-Account":account.user.id}:{}});
    workspace?.dispose();sessionStorage.removeItem("linear-replica:tabs");
    setWorkspace(null);setAccount({configured:true,user:null});setAttempt(value=>value+1);
  };
  const refreshMembers=async()=>{
    if(!account?.user)return;
    const list:MembershipSummary=await serverRequest("/api/workspaces",{},accountRequest(account.user.id));
    setSummary(list);
    if(list.workspaces.some(item=>item.id===selected)){
      const roster=await serverRequest("/api/members",{},accountRequest(account.user.id,selected));setMembers(roster.members);
    }
  };
  const switchWorkspace=async(id:string,discard=false)=>{
    if(!account?.user)return;
    await workspace?.flushed();
    if(workspace?.saveState==="error"&&!discard)throw Object.assign(new Error("Save your changes or export a backup before switching workspaces."),{name:"WorkspaceSaveRequired"});
    // Authorize the destination before disposing the current workspace.
    await serverRequest("/api/members",{},accountRequest(account.user.id,id));
    sessionStorage.setItem(`replica:workspace:${account.user.id}`,id);
    sessionStorage.removeItem("linear-replica:tabs");window.location.hash="#/settings";
    workspace?.dispose();setWorkspace(null);setAttempt(value=>value+1);
  };
  return workspace || accessEmpty ? (
    <AccountContext.Provider value={account?.user?{user:account.user,membership:summary.workspaces.find(item=>item.id===selected)??null,summary,members,refreshMembers,switchWorkspace,signOut,reconnect:()=>setReconnect(true)}:null}>
      {workspace?<App key={selected||"offline"} workspace={workspace} initialSession={initialSession} />:<main className="r-boot"><h1>Choose a workspace</h1><p>Your account currently has no workspace membership. You can accept an invitation below.</p><WorkspaceAccounts/><button onClick={()=>void signOut().catch(e=>setError(String(e)))}>Sign out</button></main>}
      {reconnect&&workspace&&account?.user&&<Dialog title="Reconnect account" onClose={()=>setReconnect(false)}><div className="r-account-reconnect"><AccountGate lockedEmail={account.user.email} onCancel={()=>setReconnect(false)} onSignedIn={()=>{setReconnect(false);if(workspace.saveState==="error")workspace.retrySave();void workspace.refreshShared();void refreshMembers().catch(()=>{});}}/></div></Dialog>}
    </AccountContext.Provider>
  ) : (
    <div className="r-boot" role="status">
      Opening workspace…
    </div>
  );
}
// Vite can reevaluate this entry when a shared store module changes. Reuse the
// mounted root across that update rather than mounting two React trees.
const root =
  import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(
  <StrictMode>
    <RenderBoundary>
      <Bootstrap />
    </RenderBoundary>
  </StrictMode>,
);

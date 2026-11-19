import { createContext, useEffect, useState } from "react";
import { serverRequest, type AccountUser, type MembershipSummary, type WorkspaceMember, type WorkspaceMembership } from "./remote-repository";
import { Button, Field } from "./ui";

export const AccountContext=createContext<{user:AccountUser;membership:WorkspaceMembership|null;summary:MembershipSummary;members:WorkspaceMember[];refreshMembers:()=>Promise<void>;switchWorkspace:(id:string,discard?:boolean)=>Promise<void>;signOut:()=>Promise<void>;reconnect:()=>void}|null>(null);
export function AccountGate({onSignedIn,lockedEmail,onCancel}:{onSignedIn:()=>void;lockedEmail?:string;onCancel?:()=>void}) {
  const [register,setRegister]=useState(false),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[name,setName]=useState(""),[workspace,setWorkspace]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{if(!lockedEmail)document.title=register?"Create workspace — Linear Replica":"Log in — Linear Replica";},[register,lockedEmail]);
  return <main className="r-account-gate"><div className="r-account-card">
    <div className="r-account-mark" aria-hidden="true">◒</div><p className="r-muted">Linear Replica</p>
    <h1>{lockedEmail?"Reconnect your account":register?"Create your workspace":"Log in to your workspace"}</h1>
    <form onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);setError("");try{await serverRequest(`/api/auth/${register?"register":"login"}`,{method:"POST",body:JSON.stringify({email:lockedEmail??email,password,name,workspace})});setPassword("");onSignedIn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}}>
      {register&&<><Field label="Your name"><input autoComplete="name" required maxLength={80} value={name} onChange={event=>setName(event.target.value)}/></Field><Field label="Workspace name"><input required maxLength={120} value={workspace} onChange={event=>setWorkspace(event.target.value)}/></Field></>}
      <Field label="Email"><input type="email" autoComplete="email" required disabled={!!lockedEmail} value={lockedEmail??email} onChange={event=>setEmail(event.target.value)}/></Field>
      <Field label="Password"><input type="password" autoComplete={register?"new-password":"current-password"} required minLength={register?12:1} maxLength={1024} value={password} onChange={event=>setPassword(event.target.value)}/></Field>
      {register&&<p className="r-muted">Use at least 12 characters.</p>}
      {error&&<p className="r-error" role="alert">{error}</p>}
      <Button primary type="submit" disabled={busy}>{busy?"Please wait…":register?"Create account":"Log in"}</Button>
    </form>
    {!lockedEmail&&<Button disabled={busy} onClick={()=>{setRegister(!register);setError("");setPassword("");}}>{register?"Already have an account? Log in":"Create an account"}</Button>}
    {onCancel&&<Button onClick={onCancel} disabled={busy}>Back to workspace</Button>}
    <p className="r-account-note">{lockedEmail?"Your unsaved changes remain in this window while you reconnect.":"This account belongs to this Replica server. To move an offline workspace here, export it first, then import it in Settings after signing in."}</p>
  </div></main>;
}

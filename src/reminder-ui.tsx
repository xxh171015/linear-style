import { useState } from "react";
import { Button, Dialog, IconButton, useData, useWorkspace } from "./ui";
import { localDay, parseReminderInput, reminderPresets } from "./reminders";

export function IssueReminderDialog({id,onClose}:{id:string;onClose:()=>void}) {
  const data=useData(), workspace=useWorkspace();
  const [custom,setCustom]=useState(false),[query,setQuery]=useState(""),[error,setError]=useState("");
  const now=new Date(), tomorrow=new Date(now);tomorrow.setDate(now.getDate()+1);
  const [selected,setSelected]=useState(localDay(tomorrow)),[offset,setOffset]=useState(0);
  const presets=reminderPresets(now,data.cycles), typed=parseReminderInput(query,now);
  const save=(date:Date)=>{try{workspace.scheduleIssueReminder(id,date.toISOString());onClose();}catch(e){setError(e instanceof Error?e.message:String(e));}};
  const pending=data.inbox.filter(item=>item.kind==="reminder" && item.issueId===id && !item.archivedAt && Date.parse(item.snoozedUntil??"")>now.getTime());
  return <Dialog title={custom?"Remind me about this issue on":"Remind me"} onClose={onClose}>
    {!custom?<div className="r-reminder-options">
      <form onSubmit={event=>{event.preventDefault();if(typed)save(typed);else setError("Enter a future time, such as 4 pm or in 2 days.");}}>
        <input autoFocus aria-label="Reminder time" placeholder="Try: 4 pm, 2 days, in 5 weeks…" value={query} onChange={e=>{setQuery(e.target.value);setError("");}} />
        {typed && <button className="r-reminder-option" type="submit"><span>Remind me</span><time>{typed.toLocaleString()}</time></button>}
      </form>
      {presets.filter(p=>!query||p.label.toLowerCase().includes(query.toLowerCase())).map(p=><button className="r-reminder-option" key={p.label} disabled={!p.date||p.date<=now} onClick={()=>p.date&&save(p.date)}><span>{p.label}</span><time>{p.date?.toLocaleString(undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})??"No upcoming cycle"}</time></button>)}
      <button className="r-reminder-option" onClick={()=>setCustom(true)}>Custom…</button>
    </div>:<>
      <div className="r-inline"><span className="r-push"/><IconButton label="Previous month" disabled={offset===0} onClick={()=>setOffset(offset-1)}>‹</IconButton><IconButton label="Next month" onClick={()=>setOffset(offset+1)}>›</IconButton></div>
      <div className="r-reminder-calendars">{[offset,offset+1].map(shift=>{
        const month=new Date(now.getFullYear(),now.getMonth()+shift,1),label=month.toLocaleString(undefined,{month:"long",year:"numeric"});
        const blanks=(month.getDay()+6)%7, days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
        return <section key={shift} aria-label={label}><h3>{label}</h3><div className="r-reminder-calendar" role="group" aria-label={`Choose day in ${label}`}>
          {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d=><span key={d}>{d}</span>)}
          {Array.from({length:blanks},(_,i)=><span key={`blank-${i}`}/>)}
          {Array.from({length:days},(_,i)=>{const day=new Date(month.getFullYear(),month.getMonth(),i+1),value=localDay(day);return <button key={value} aria-label={day.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})} aria-pressed={value===selected} disabled={value<=localDay(now)} onClick={()=>setSelected(value)}>{i+1}</button>;})}
        </div></section>;
      })}</div>
      <footer><Button onClick={()=>setCustom(false)}>Back</Button><Button onClick={onClose}>Cancel</Button><Button primary onClick={()=>save(new Date(`${selected}T09:00:00`))}>Apply</Button></footer>
    </>}
    {pending.map(item=><div className="r-reminder-pending" key={item.id}><span>Reminder set for {new Date(item.snoozedUntil!).toLocaleString()}</span><Button onClick={()=>{workspace.cancelIssueReminder(item.id);onClose();}}>Cancel reminder</Button></div>)}
    {error&&<p role="alert" className="r-error">{error}</p>}
    <p className="r-muted r-reminder-note">Reminders appear in your inbox when due. Desktop alerts require the app to be open and notifications enabled.</p>
  </Dialog>;
}

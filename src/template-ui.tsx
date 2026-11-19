import { useState } from "react";
import type { IssueTemplate, TemplateRequiredField } from "./types";
import { Button,Dialog,Field,RichEditor,useData,useWorkspace } from "./ui";
import { currentTeam, emptyDraft } from "./workspace";
import { ISSUE_STATUSES,PRIORITY_LABEL,STATUS_LABEL } from "./kernel";
const REQUIRED_FIELDS: { id: TemplateRequiredField; label: string }[] = [
  { id: "priority", label: "Priority" },
  { id: "assignee", label: "Assignee" },
  { id: "project", label: "Project" },
  { id: "status", label: "Status" },
];
export function IssueTemplateSettings() {
  const data=useData(),workspace=useWorkspace();
  const [edit,setEdit]=useState<IssueTemplate|null>(null),[error,setError]=useState("");
  return <section className="r-template-settings">
    <div className="r-inline"><h3>Issue templates</h3><span className="r-push"/><Button onClick={()=>{setEdit({id:"",name:"",fields:emptyDraft(),teamKey:currentTeam(data).key});setError("");}}>New template</Button></div>
    {data.templates.map(template=><div key={template.id} className="r-inline"><strong>{template.name}{template.teamKey?` · ${template.teamKey}`:""}{template.deletedAt?" · Deleted":""}</strong><span className="r-push"/>
      {template.deletedAt?<Button onClick={()=>workspace.setTemplateDeleted(template.id,false)}>Restore template</Button>:<><Button onClick={()=>{setEdit(structuredClone(template));setError("");}}>Edit template</Button><Button onClick={()=>workspace.setTemplateDeleted(template.id,true)}>Delete template</Button></>}
    </div>)}
    {!data.templates.length && <p className="r-muted">Save reusable task titles, descriptions and properties.</p>}
    {edit && <Dialog wide title={edit.id?"Edit issue template":"New issue template"} onClose={()=>setEdit(null)}><form onSubmit={event=>{
      event.preventDefault();try{workspace.saveIssueTemplate(edit.name,edit.fields,edit.id || undefined,{teamKey:edit.teamKey,required:edit.required});setEdit(null);}catch(error){setError(error instanceof Error?error.message:String(error));}
    }}>
      <Field label="Template name"><input autoFocus aria-label="Template name" value={edit.name} onChange={event=>setEdit({...edit,name:event.target.value})}/></Field>
      <Field label="Team">
        <select aria-label="Template team" value={edit.teamKey ?? ""} onChange={event=>setEdit({...edit,teamKey:event.target.value || undefined})}>
          <option value="">All teams</option>
          {data.teams.map(team=><option key={team.key} value={team.key}>{team.key} · {team.name}</option>)}
        </select>
      </Field>
      <Field label="Issue title"><input aria-label="Template issue title" value={edit.fields.title} onChange={event=>setEdit({...edit,fields:{...edit.fields,title:event.target.value}})}/></Field>
      <RichEditor label="Template description" value={edit.fields.body} onChange={body=>setEdit({...edit,fields:{...edit.fields,body}})}/>
      <div className="r-form-grid"><Field label="Status"><select value={edit.fields.status} onChange={event=>setEdit({...edit,fields:{...edit.fields,status:event.target.value as typeof edit.fields.status}})}>{ISSUE_STATUSES.map(status=><option key={status} value={status}>{STATUS_LABEL[status]}</option>)}</select></Field>
      <Field label="Priority"><select value={edit.fields.priority} onChange={event=>setEdit({...edit,fields:{...edit.fields,priority:Number(event.target.value) as typeof edit.fields.priority}})}>{PRIORITY_LABEL.map((label,index)=><option key={index} value={index}>{label}</option>)}</select></Field></div>
      <Field label="Labels"><input aria-label="Template labels" value={edit.fields.labels.join(", ")} onChange={event=>setEdit({...edit,fields:{...edit.fields,labels:event.target.value.split(",").map(label=>label.trim()).filter(Boolean)}})}/></Field>
      <p className="r-muted">Required fields must be filled before creating an issue from this template.</p>
      {REQUIRED_FIELDS.map(field=><label className="r-check-line" key={field.id}><span>Require {field.label}</span><input type="checkbox" aria-label={`Require ${field.label}`} checked={edit.required?.includes(field.id)??false} onChange={event=>{
        const next=new Set(edit.required ?? []);
        if(event.target.checked)next.add(field.id);else next.delete(field.id);
        setEdit({...edit,required:[...next]});
      }}/></label>)}
      {error && <p role="alert" className="r-error">{error}</p>}
      <footer><Button onClick={()=>setEdit(null)}>Cancel</Button><Button primary type="submit" disabled={!edit.name.trim()}>Save template</Button></footer>
    </form></Dialog>}
  </section>;
}

import { useEffect,useState } from "react";
import { Attachments,Button,Dialog,Empty,Field,FileInput,RichEditor,RichText,useData,useWorkspace } from "./ui";
import { navigate,type Route } from "./router";

export function DocumentsPage({route}:{route:Route}) {
  const data=useData(),workspace=useWorkspace();
  const [creating,setCreating]=useState(route.id==="new"),[query,setQuery]=useState(""),[deleted,setDeleted]=useState(false);
  const [title,setTitle]=useState(""),[body,setBody]=useState(""),[projectId,setProjectId]=useState(""),[error,setError]=useState("");
  const doc=data.documents.find(doc=>doc.id===route.id);
  const [draftTitle,setDraftTitle]=useState(doc?.title ?? "");
  useEffect(()=>setDraftTitle(doc?.title ?? ""),[doc?.id,doc?.title]);
  useEffect(()=>{if(route.id==="new"){setCreating(true);navigate({nav:"documents"});}},[route.id]);
  const run=(command:()=>void)=>{try{command();setError("");}catch(error){setError(error instanceof Error?error.message:String(error));}};
  return <>
    <header className="r-page-heading"><h1>{doc?.title ?? "Documents"}</h1><div className="r-heading-actions"><Button onClick={()=>{setCreating(true);setTitle("");setBody("");}}>New document</Button></div></header>
    {doc?<div className="r-document-page">
      <Button onClick={()=>navigate({nav:"documents"})}>‹ All documents</Button>
      {doc.issueId&&<p className="r-document-owner"><a href={`#/issue/${encodeURIComponent(doc.issueId)}`}>{doc.issueId} · {data.issues.find(issue=>issue.id===doc.issueId)?.title ?? "Deleted issue"}</a><span> › {doc.title}</span></p>}
      <input autoFocus className="r-title-input" aria-label="Document title" value={draftTitle} disabled={!!doc.deletedAt} onChange={event=>{const title=event.target.value;setDraftTitle(title);if(title.trim())run(()=>workspace.updateDocument(doc.id,{title}));}} onBlur={()=>{if(draftTitle!==doc.title)run(()=>workspace.updateDocument(doc.id,{title:draftTitle}));}}/>
      {doc.deletedAt?<><p className="r-muted">This document is deleted.</p><RichText text={doc.body}/><Button onClick={()=>run(()=>workspace.setDocumentDeleted(doc.id,false))}>Restore document</Button></>:<>
        <Field label="Project"><select aria-label="Document project" value={doc.projectId ?? ""} onChange={event=>run(()=>workspace.updateDocument(doc.id,{projectId:event.target.value || undefined}))}><option value="">No project</option>{data.projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
        <Field label="Issue"><select aria-label="Document issue" value={doc.issueId ?? ""} onChange={event=>run(()=>workspace.updateDocument(doc.id,{issueId:event.target.value || undefined}))}><option value="">No issue</option>{data.issues.map(issue=><option key={issue.id} value={issue.id}>{issue.id} · {issue.title}</option>)}</select></Field>
        <RichEditor label="Document content" value={doc.body} onChange={body=>run(()=>workspace.updateDocument(doc.id,{body}))}/>
        <Attachments ownerId={doc.id}/><div className="r-inline"><FileInput ownerId={doc.id}/><span className="r-push"/><Button onClick={()=>run(()=>workspace.setDocumentDeleted(doc.id,true))}>Move document to trash</Button></div>
      </>}
    </div>:<>
      <div className="r-list-toolbar"><input aria-label="Search documents" placeholder="Search documents…" value={query} onChange={event=>setQuery(event.target.value)}/><Button onClick={()=>setDeleted(!deleted)}>{deleted?"Active documents":"Deleted documents"}</Button></div>
      <div className="r-document-list">{data.documents.filter(doc=>!!doc.deletedAt===deleted && `${doc.title} ${doc.body} ${doc.issueId??""}`.toLowerCase().includes(query.toLowerCase())).map(doc=><a key={doc.id} href={`#/documents/${encodeURIComponent(doc.id)}`}><strong>{doc.title}</strong><span>{doc.issueId??(doc.projectId?data.projects.find(project=>project.id===doc.projectId)?.name:"No project")}</span><time>{new Date(doc.updatedAt).toLocaleDateString()}</time></a>)}</div>
      {!data.documents.some(doc=>!!doc.deletedAt===deleted) && <Empty title={deleted?"No deleted documents":"No documents yet"}/>}</>}
    {error && <p role="alert" className="r-error">{error}</p>}
    {creating && <Dialog wide title="New document" onClose={()=>setCreating(false)}><form onSubmit={event=>{event.preventDefault();run(()=>{const created=workspace.createDocument(title,body,projectId || undefined);setCreating(false);navigate({nav:"documents",id:created.id});});}}>
      <Field label="Document title"><input autoFocus aria-label="New document title" value={title} onChange={event=>setTitle(event.target.value)}/></Field>
      <Field label="Project"><select aria-label="New document project" value={projectId} onChange={event=>setProjectId(event.target.value)}><option value="">No project</option>{data.projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
      <RichEditor label="New document content" value={body} onChange={setBody}/>
      {error && <p role="alert" className="r-error">{error}</p>}
      <footer><Button onClick={()=>setCreating(false)}>Cancel</Button><Button primary type="submit" disabled={!title.trim()}>Create document</Button></footer>
    </form></Dialog>}
  </>;
}

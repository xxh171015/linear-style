import { useState } from "react";
import * as I from "./icons";
import type { IssueLink } from "./types";
import { Button, Dialog, Field, IconButton, useData, useWorkspace } from "./ui";

export function IssueLinkDialog({issueId,link,onClose}:{issueId:string;link?:IssueLink;onClose:()=>void}) {
  const workspace=useWorkspace();
  const [url,setURL]=useState(link?.url??""),[title,setTitle]=useState(link?.title??""),[error,setError]=useState("");
  return <Dialog title={`${link?"Edit link on":"Add link to"} ${issueId}`} onClose={onClose}>
    <form onSubmit={event=>{event.preventDefault();try{workspace.saveIssueLink(issueId,{url,title},link?.id);onClose();}catch(e){setError(e instanceof Error?e.message:String(e));}}}>
      <Field label="URL"><input autoFocus required type="url" aria-label="Resource URL" placeholder="https://…" value={url} onChange={event=>setURL(event.target.value)}/></Field>
      <Field label="Title (optional)"><input aria-label="Resource title" value={title} onChange={event=>setTitle(event.target.value)}/></Field>
      {error&&<p className="r-error" role="alert">{error}</p>}
      <footer><Button onClick={onClose}>Cancel</Button><Button primary type="submit" disabled={!url.trim()}>{link?"Save link":"Add link"}</Button></footer>
    </form>
  </Dialog>;
}

export function IssueResources({id,onEdit}:{id:string;onEdit:(link:IssueLink)=>void}) {
  const data=useData(),workspace=useWorkspace(),[error,setError]=useState("");
  const issue=data.issues.find(issue=>issue.id===id),docs=data.documents.filter(doc=>doc.issueId===id&&!doc.deletedAt);
  if(!issue?.links?.length&&!docs.length)return null;
  return <section className="r-issue-resources" aria-label="Issue resources"><h3>Resources</h3>
    {issue?.links?.map(link=><div className="r-resource" key={link.id}>
      <I.ShareIcon/><a href={link.url} target="_blank" rel="noopener noreferrer" title={link.url}>{link.title}</a>
      <IconButton label={`Edit link ${link.title}`} onClick={()=>onEdit(link)}><I.MoreIcon/></IconButton>
      <IconButton label={`Remove link ${link.title}`} onClick={()=>{try{workspace.removeIssueLink(id,link.id);setError("");}catch(e){setError(e instanceof Error?e.message:String(e));}}}><I.CloseIcon/></IconButton>
    </div>)}
    {docs.map(doc=><div className="r-resource" key={doc.id}><I.DocsIcon/><a href={`#/documents/${encodeURIComponent(doc.id)}`}>{doc.title}</a></div>)}
    {error&&<p className="r-error" role="alert">{error}</p>}
  </section>;
}

import { useState } from "react";
import { Button, Dialog, Empty, Status, useAllData, useWorkspace } from "./ui";
import type { PageProps } from "./feature-pages";

export function ArchivePage({ onIssue }: PageProps) {
  const data = useAllData(), workspace = useWorkspace();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"issues" | "documents" | "templates">("issues");
  const issues = data.issues.filter(issue => issue.deletedAt &&
    `${issue.id} ${issue.title}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));
  const documents = data.documents.filter(doc => doc.deletedAt &&
    `${doc.title} ${doc.body}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));
  const templates = data.templates.filter(template => template.deletedAt &&
    template.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  return <>
    <header className="r-page-heading"><h1>Archive</h1></header>
    <div className="r-segment r-archive-tabs">
      {([["issues","Issues"],["documents","Documents"],["templates","Templates"]] as const).map(([id,label]) =>
        <button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}
    </div>
    <div className="r-archive-tools"><strong>{tab==="issues"?issues.length:tab==="documents"?documents.length:templates.length} {tab}</strong>
      <input aria-label={`Search deleted ${tab}`} placeholder={`Search deleted ${tab}…`} value={query} onChange={event => setQuery(event.target.value)} />
    </div>
    {tab==="issues" && <div className="r-archive-list">
      {issues.map(issue => <div className="r-archive-row" key={issue.id}>
        <button onClick={() => onIssue(issue.id)} aria-label={`Open deleted ${issue.id} ${issue.title}`}>
          <span className="r-issue-id">{issue.id}</span><Status status={issue.status} /><span>{issue.title}</span>
        </button>
        <time dateTime={issue.deletedAt} title={new Date(issue.deletedAt!).toLocaleString()}>Deleted {new Date(issue.deletedAt!).toLocaleDateString()}</time>
        <Button onClick={() => workspace.restoreIssue(issue.id)}>Restore</Button>
      </div>)}
      {!issues.length && <Empty title={query ? "No matching deleted issues" : "No recently deleted issues"} description="Deleted issues appear here so you can restore them." />}
    </div>}
    {tab==="documents" && <div className="r-archive-list">
      {documents.map(doc => <div className="r-archive-row" key={doc.id}>
        <a href={`#/documents/${encodeURIComponent(doc.id)}`}><strong>{doc.title}</strong></a>
        <time dateTime={doc.deletedAt}>Deleted {new Date(doc.deletedAt!).toLocaleDateString()}</time>
        <Button onClick={() => workspace.setDocumentDeleted(doc.id, false)}>Restore</Button>
      </div>)}
      {!documents.length && <Empty title="No deleted documents" />}
    </div>}
    {tab==="templates" && <div className="r-archive-list">
      {templates.map(template => <div className="r-archive-row" key={template.id}>
        <strong>{template.name}</strong>
        <time dateTime={template.deletedAt}>Deleted {new Date(template.deletedAt!).toLocaleDateString()}</time>
        <Button onClick={() => workspace.setTemplateDeleted(template.id, false)}>Restore</Button>
      </div>)}
      {!templates.length && <Empty title="No deleted templates" />}
    </div>}
  </>;
}

export function DeleteIssueDialog({id,onClose}: {id:string;onClose:()=>void}) {
  const data = useAllData(), workspace = useWorkspace();
  const issue = data.issues.find(issue => issue.id === id);
  const [error,setError] = useState("");
  if (!issue || issue.deletedAt) return null;
  return <Dialog title="Delete issue" onClose={onClose}>
    <div className="r-document"><p>Delete <strong>{issue.id} · {issue.title}</strong>?</p>
      <p>The issue will be moved to Recently deleted. You can restore it from the team archive.</p>
      {error && <p role="alert" className="r-error">{error}</p>}
      <footer><Button onClick={onClose}>Cancel</Button><span className="r-push" /><Button primary onClick={() => {
        try { workspace.deleteIssue(id); onClose(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      }}>Delete issue</Button></footer>
    </div>
  </Dialog>;
}

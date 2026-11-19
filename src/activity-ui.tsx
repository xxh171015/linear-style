import { useState } from "react";
import type { Activity } from "./types";
import { Avatar, Button, Dialog, RichEditor, RichText, useData, useWorkspace } from "./ui";
import { formatDate } from "./workspace";

export function DescriptionHistory({id,onClose}:{id:string;onClose:()=>void}) {
  const data=useData(),workspace=useWorkspace();
  const issue=data.issues.find(issue=>issue.id===id)!;
  const [selected,setSelected]=useState("current"),[error,setError]=useState("");
  const revisions=[{id:"current",body:issue.body,label:"Current version",time:issue.updatedAt ?? "",author:""},
    ...data.activity.filter(item=>item.issueId===id && item.kind==="description").map(item=>({id:item.id,body:item.body ?? "",label:`Before ${new Date(item.time).toLocaleString()}`,time:item.time,author:item.author ?? ""}))];
  const current=revisions.find(item=>item.id===selected) ?? revisions[0];
  return <Dialog wide title="Description history" onClose={onClose}>
    <div className="r-description-history">
      <nav aria-label="Description versions">{revisions.map(item=><button key={item.id} aria-current={current.id===item.id?"true":undefined} onClick={()=>setSelected(item.id)}>{item.label}<small>{item.author}</small></button>)}</nav>
      <section aria-label="Version preview">{current.body?<RichText text={current.body}/>:<p className="r-muted">Empty description</p>}</section>
    </div>
    {revisions.length===1 && <p className="r-muted">No earlier versions are available.</p>}
    {error && <p role="alert" className="r-error">{error}</p>}
    <footer><Button onClick={onClose}>Close</Button><span className="r-push"/><Button primary disabled={current.id==="current" || current.body===issue.body} onClick={()=>{
      try {workspace.updateIssue(id,{body:current.body},"restored the description");onClose();}catch(error){setError(error instanceof Error?error.message:String(error));}
    }}>Restore this version</Button></footer>
  </Dialog>;
}
function CommentCard({comment,replies=[]}:{comment:Activity;replies?:Activity[]}) {
  const data=useData(),workspace=useWorkspace();
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(comment.body ?? ""),[replying,setReplying]=useState(false),[reply,setReply]=useState(""),[error,setError]=useState("");
  const own=comment.author===data.settings.user;
  const run=(command:()=>void)=>{try{command();setError("");}catch(error){setError(error instanceof Error?error.message:String(error));}};
  return <div className="r-comment-thread">
    <div className="r-comment-item"><Avatar small name={comment.author}/><div className="r-activity-content">
      <strong>{comment.author}</strong><time>{formatDate(comment.time)}{comment.editedAt?" · Edited":""}</time>
      {comment.deletedAt?<p className="r-muted">Comment deleted{own && <Button onClick={()=>run(()=>workspace.setCommentDeleted(comment.id,false))}>Undo delete</Button>}</p>:editing?<div>
        <RichEditor compact label={`Edit comment ${comment.id}`} value={draft} onChange={setDraft}/>
        <div className="r-inline"><Button primary onClick={()=>run(()=>{workspace.editComment(comment.id,draft);setEditing(false);})}>Save comment</Button><Button onClick={()=>setEditing(false)}>Cancel edit</Button></div>
      </div>:<><RichText text={comment.body ?? ""}/><div className="r-inline r-comment-actions">
        <Button onClick={()=>setReplying(!replying)}>Reply</Button>
        {own && <><Button onClick={()=>{setDraft(comment.body ?? "");setEditing(true);}}>Edit comment</Button><Button onClick={()=>run(()=>workspace.setCommentDeleted(comment.id,true))}>Delete comment</Button></>}
      </div><Reactions scope="comment" id={comment.id}/></>}
      {error && <p role="alert" className="r-error">{error}</p>}
      {replying && <form onSubmit={event=>{event.preventDefault();run(()=>{workspace.comment(comment.issueId,reply,comment.id);setReply("");setReplying(false);});}}>
        <RichEditor compact label={`Reply to comment ${comment.id}`} value={reply} onChange={setReply}/>
        <Button primary type="submit" disabled={!reply.trim()}>Send reply</Button><Button onClick={()=>setReplying(false)}>Cancel reply</Button>
      </form>}
    </div></div>
    {replies.length>0 && <div className="r-comment-replies" aria-label="Comment replies">{replies.map(item=><CommentCard key={item.id} comment={item}/>)}</div>}
  </div>;
}
export function IssueActivity({id}:{id:string}) {
  const data=useData();
  const events=data.activity.filter(item=>item.issueId===id);
  return <div className="r-activity-list">{events.filter(item=>!item.parentId).map(item=>item.kind==="comment"?<CommentCard key={item.id} comment={item} replies={events.filter(reply=>reply.parentId===item.id).reverse()}/>:<div key={item.id}>
    <Avatar small name={item.author ?? data.settings.user}/><div className="r-activity-content"><p>{item.text}</p><time>{formatDate(item.time) || item.time}</time></div>
  </div>)}</div>;
}


export function Reactions({scope,id}:{scope:"issue"|"comment";id:string}) {
  const data=useData(),workspace=useWorkspace();
  const [open,setOpen]=useState(false),[custom,setCustom]=useState(""),[error,setError]=useState("");
  const item=scope==="issue"?data.issues.find(issue=>issue.id===id):data.activity.find(comment=>comment.id===id);
  const toggle=(emoji:string)=>{try{workspace.toggleReaction(scope,id,emoji);setOpen(false);setError("");}catch(error){setError(error instanceof Error?error.message:String(error));}};
  return <div className="r-reactions" aria-label={`${scope} reactions`}>
    {Object.entries(item?.reactions ?? {}).map(([emoji,people])=><button key={emoji} type="button" aria-pressed={people.includes(data.settings.user)} title={people.join(", ")} onClick={()=>toggle(emoji)}>{emoji} {people.length}</button>)}
    <Button onClick={()=>setOpen(!open)}>Add reaction</Button>
    {open && <div className="r-reaction-picker" role="dialog" aria-label="Choose reaction">
      {["👍","👎","🎉","❤️","👀","🚀","✅","🙌"].map(emoji=><button type="button" aria-label={`React ${emoji}`} key={emoji} onClick={()=>toggle(emoji)}>{emoji}</button>)}
      <input aria-label="Custom reaction" placeholder="Emoji" value={custom} maxLength={24} onChange={event=>setCustom(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();event.stopPropagation();toggle(custom);}}}/>
      <Button onClick={()=>toggle(custom)}>Add</Button><Button onClick={()=>setOpen(false)}>Close reactions</Button>
    </div>}
    {error && <p role="alert" className="r-error">{error}</p>}
  </div>;
}

import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { createBlockMarkdownSpec, createInlineMarkdownSpec, generateHTML, Node, type Extensions } from "@tiptap/core";
import { Table, TableKit } from "@tiptap/extension-table";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";

export const Callout = Node.create({
  name: "callout", group: "block", content: "block+", defining: true,
  parseHTML: () => [{tag:'aside[data-callout]'}],
  renderHTML: () => ['aside', {'data-callout':'',class:'r-callout'}, 0],
  ...createBlockMarkdownSpec({nodeName:"callout",allowedAttributes:[]}),
});
// HTML within Markdown retains spans, multiple paragraphs and nested content.
// GFM tables cannot represent these structures without losing authored data.
const RichTable = Table.extend({
  renderMarkdown: (node): string => generateHTML({type:"doc",content:[node]},richTextExtensions("",false)),
});
export const Mention = Node.create({
  name:"mention",group:"inline",inline:true,atom:true,
  addAttributes:()=>({id:{default:""},label:{default:""},kind:{default:"user"}}),
  parseHTML:()=>[{tag:"[data-mention-id]",getAttrs:element=>({id:element.getAttribute("data-mention-id"),label:element.getAttribute("data-mention-label"),kind:element.getAttribute("data-mention-kind")})}],
  renderHTML:({node})=>{
    const {id,label,kind}=node.attrs;
    const attributes={class:"r-mention","data-mention-id":id,"data-mention-label":label,"data-mention-kind":kind};
    if(kind==="issue" || kind==="project")return ['a',{...attributes,href:`#/${kind}/${encodeURIComponent(id)}`},String(label)];
    return ['span',attributes,`@${label}`];
  },
  renderText:({node})=>`${node.attrs.kind==="user"?"@":""}${node.attrs.label}`,
  ...createInlineMarkdownSpec({nodeName:"mention",selfClosing:true,allowedAttributes:["id","label","kind"],
    serializeAttributes:attrs=>Object.entries(attrs).map(([key,value])=>`${key}="${encodeURIComponent(String(value))}"`).join(" "),
    parseAttributes:value=>Object.fromEntries([...value.matchAll(/(id|label|kind)="([^"]*)"/g)].map(([,key,encoded])=>{
      try{return [key,decodeURIComponent(encoded)];}catch{return [key,encoded];}
    })),
  }),
});

export function safeLink(value: string) {
  return /^(https?:\/\/|mailto:)[^\s]+$/i.test(value);
}
export function richTextExtensions(placeholder = "", editable = true): Extensions {
  return [
    StarterKit.configure({ link: { openOnClick: !editable, autolink: true,
      isAllowedUri: url => safeLink(url), HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } } }),
    TaskList, TaskItem.configure({ nested: true }), Markdown,
    TableKit.configure({table:false}), RichTable, Callout, Mention,
    Details.configure({persist:true}), DetailsSummary, DetailsContent,
    Placeholder.configure({ placeholder }),
  ];
}

import { useContext, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import { findParentNode } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { richTextExtensions, safeLink } from "./rich-text";
import { WorkspaceContext } from "./context";
const noSubscribe = () => () => {};
const noData = () => undefined;

export function RichText({ text }: { text: string }) {
  const editor = useEditor({
    extensions: richTextExtensions("", false), content: text, contentType: "markdown",
    editable: false, editorProps: { attributes: { tabindex: "-1", role: "document", "aria-readonly": "true" } },
  });
  useEffect(() => {
    if (editor && editor.getMarkdown() !== text)
      editor.commands.setContent(text, { contentType: "markdown", emitUpdate: false });
  }, [editor, text]);
  return <EditorContent className="r-richtext" editor={editor} onClick={event => {
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href") ?? "";
    if (href.startsWith("#attachment/")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }} />;
}

export function RichEditor({ value, onChange, label, placeholder = "Write something…", autoFocus = false, onSubmit, compact = false, attachmentOwnerId }: {
  value: string; onChange: (value: string) => void; label: string; placeholder?: string;
  autoFocus?: boolean; onSubmit?: (value: string) => void; compact?: boolean;
  attachmentOwnerId?: string;
}) {
  const workspace = useContext(WorkspaceContext);
  const data = useSyncExternalStore(workspace?.subscribe ?? noSubscribe,workspace?.getActiveSnapshot ?? noData);
  const emitted = useRef(value);
  const slashKey = useRef<(event: globalThis.KeyboardEvent) => boolean>(() => false);
  const [slashIndex,setSlashIndex] = useState(0), [dismissedSlash,setDismissedSlash] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, updatePosition] = useState(0);
  const [menu, setMenu] = useState<"blocks" | "lists" | "link" | null>(null);
  const [tools, setTools] = useState(false), [url, setUrl] = useState(""), [error, setError] = useState("");
  const editor = useEditor({
    extensions: richTextExtensions(placeholder), content: value, contentType: "markdown",
    autofocus: autoFocus ? "end" : false, shouldRerenderOnTransaction: true,
    editorProps: { attributes: { role: "textbox", "aria-label": label, "aria-multiline": "true", spellcheck: "true" }, handleKeyDown: (_view,event) => slashKey.current(event) },
    onUpdate: ({ editor: current }) => {
      emitted.current = current.isEmpty ? "" : current.getMarkdown();
      onChange(emitted.current);
    },
  });
  useEffect(() => {
    if (editor && value !== emitted.current) {
      emitted.current = value;
      editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    }
  }, [value, editor]);
  useEffect(() => {
    if (!editor) return;
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && slashKey.current(event)) { event.preventDefault(); event.stopPropagation(); return; }
      if (event.key !== "Escape" || (!tools && !menu)) return;
      event.preventDefault(); event.stopPropagation();
      setMenu(null); setTools(false); editor.commands.focus();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [editor, tools, menu]);
  useEffect(() => {
    const position = () => updatePosition(value => value + 1);
    const outside = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node) && !editor?.view.dom.contains(event.target as Node)) {
        setMenu(null); setTools(false);
      }
    };
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("mousedown", outside);
    return () => { window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); document.removeEventListener("mousedown", outside); };
  }, [editor]);
  if (!editor) return null;
  const insertion = [
    ...([1,2,3] as const).map(level => ({name:`Heading ${level}`,search:`heading h${level}`,run:()=>editor.chain().focus().toggleHeading({level}).run()})),
    {name:"Bulleted list",search:"bullet list",run:()=>editor.chain().focus().toggleBulletList().run()},
    {name:"Numbered list",search:"ordered number list",run:()=>editor.chain().focus().toggleOrderedList().run()},
    {name:"Checklist",search:"todo task checklist",run:()=>editor.chain().focus().toggleTaskList().run()},
    {name:"Blockquote",search:"quote",run:()=>editor.chain().focus().toggleBlockquote().run()},
    {name:"Callout",search:"callout note info",run:()=>editor.chain().focus().toggleWrap("callout").run()},
    {name:"Collapsible section",search:"collapse toggle details",run:()=>editor.chain().focus().insertContent({type:"details",attrs:{open:true},content:[{type:"detailsSummary",content:[{type:"text",text:"Section title"}]},{type:"detailsContent",content:[{type:"paragraph"}]}]}).run()},
    {name:"Code block",search:"code",run:()=>editor.chain().focus().toggleCodeBlock().run()},
    {name:"Table",search:"table grid",run:()=>editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run()},
    {name:"Divider",search:"divider horizontal rule",run:()=>editor.chain().focus().setHorizontalRule().run()},
    ...(attachmentOwnerId ? [{name:"Attachment",search:"file attach upload",run:()=>fileInputRef.current?.click()}] : []),
  ];
  const {selection} = editor.state;
  const before = selection.empty && selection.$from.parent.type.name === "paragraph"
    ? selection.$from.parent.textBetween(0,selection.$from.parentOffset,"\0","\0") : "";
  const inlineBefore = selection.empty && selection.$from.parent.isTextblock && !editor.isActive("codeBlock")
    ? selection.$from.parent.textBetween(0,selection.$from.parentOffset,"\0","\0") : "";
  const mentionMatch = inlineBefore.match(/(?:^|\s)@([^@\n]{0,60})$/);
  const people = data ? [...new Set([data.settings.user,...data.issues.flatMap(issue=>[issue.assignee,issue.creator].filter((name):name is string=>!!name))])] : [];
  const mentionQuery = mentionMatch?.[1].toLowerCase() ?? "";
  const mentionItems = data ? {
    people: people.map(name=>({id:name,label:name,kind:"user" as const})).filter(item=>`${item.label}`.toLowerCase().includes(mentionQuery)),
    issues: data.issues.map(issue=>({id:issue.id,label:`${issue.id} ${issue.title}`,kind:"issue" as const})).filter(item=>`${item.id} ${item.label}`.toLowerCase().includes(mentionQuery)),
    projects: data.projects.map(project=>({id:project.id,label:project.name,kind:"project" as const})).filter(item=>`${item.label}`.toLowerCase().includes(mentionQuery)),
  } : null;
  const mentionFlat = mentionItems ? [...mentionItems.people, ...mentionItems.issues, ...mentionItems.projects].slice(0, 16) : [];
  const slashMatch = before.match(/^\/([\w -]*)$/);
  const signature = `${selection.from}:${before}`;
  const mentionSignature=`${selection.from}:${inlineBefore}`;
  const mention = editor.isFocused && mentionMatch && mentionSignature !== dismissedSlash && data ? {
    from:selection.from-mentionMatch[1].length-1,to:selection.from,items:mentionFlat, groups:mentionItems,
  } : null;
  const slash = editor.isFocused && slashMatch && signature !== dismissedSlash ? {
    from:selection.$from.start(),to:selection.from,
    items:insertion.filter(item => `${item.name} ${item.search}`.toLowerCase().includes(slashMatch[1].toLowerCase())),
  } : null;
  const chooseInsertion = (index:number) => {
    const item = slash?.items[index];
    if (!item || !slash) return;
    editor.chain().focus().deleteRange({from:slash.from,to:slash.to}).run();
    item.run();setSlashIndex(0);setTools(false);setMenu(null);
  };
  const chooseMention = (item: { id: string; label: string; kind: string }) => {
    if (!mention) return;
    editor.chain().focus().deleteRange({from:mention.from,to:mention.to}).insertContent([{type:"mention",attrs:item},{type:"text",text:" "}]).run();
    setSlashIndex(0);
  };
  const insertAttachmentLink = (file: File) => {
    if (!workspace || !attachmentOwnerId) return;
    const ids = workspace.addAttachments(attachmentOwnerId, [file]);
    const name = file.name.replace(/[\[\]]/g, "");
    const link = `[${name}](#attachment/${ids[0]})`;
    editor.chain().focus().insertContent(link, { contentType: "markdown" }).run();
    emitted.current = editor.isEmpty ? "" : editor.getMarkdown();
    onChange(emitted.current);
  };
  slashKey.current = event => {
    if (event.isComposing) return false;
    if (mention) {
      if(event.key==="Escape"){setDismissedSlash(mentionSignature);return true;}
      if(event.key==="ArrowDown" || event.key==="ArrowUp") {setSlashIndex(index=>(index+(event.key==="ArrowDown"?1:-1)+Math.max(1,mention.items.length))%Math.max(1,mention.items.length));return true;}
      if(event.key==="Enter" && mention.items.length){chooseMention(mention.items[Math.min(slashIndex,mention.items.length-1)]);return true;}
    }
    if (!slash) return false;
    if (event.key === "Escape") {setDismissedSlash(signature);return true;}
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      setSlashIndex(index => (index + (event.key === "ArrowDown" ? 1 : -1) + Math.max(1,slash.items.length)) % Math.max(1,slash.items.length));return true;
    }
    if (event.key === "Enter" && slash.items.length) {chooseInsertion(Math.min(slashIndex,slash.items.length-1));return true;}
    return false;
  };
  const show = tools || menu !== null || (editor.isFocused && (!editor.state.selection.empty || editor.isActive("table")));
  let left = 20, top = 100;
  if (show && editor.view.dom.isConnected) {
    const bounds = editor.view.coordsAtPos(editor.state.selection.from);
    left = Math.max(8, Math.min(bounds.left, window.innerWidth - Math.min(490, window.innerWidth - 16) - 8));
    top = Math.max(8, bounds.top - 48);
  }
  const run = (command: () => void) => { command(); setMenu(null); };
  const tool = (name: string, text: string, action: () => void, active = false) =>
    <button type="button" title={name} aria-label={name} aria-pressed={active} onMouseDown={e => e.preventDefault()} onClick={() => run(action)}>{text}</button>;
  const keyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault(); event.stopPropagation();
      setUrl(editor.getAttributes("link").href ?? ""); setError(""); setMenu("link");
    }
    if (event.key === "Escape" && (tools || menu)) {
      event.stopPropagation(); event.preventDefault(); setMenu(null); setTools(false); editor.commands.focus();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && onSubmit && !menu) {
      event.preventDefault(); event.stopPropagation(); onSubmit(editor.isEmpty ? "" : editor.getMarkdown());
    }
  };
  return <div className={`r-editor ${compact ? "r-editor-compact" : ""}`} onKeyDown={keyDown}>
    {attachmentOwnerId && <input ref={fileInputRef} className="sr-only" type="file" tabIndex={-1} aria-hidden onChange={event=>{
      const file=event.target.files?.[0]; if(file) insertAttachmentLink(file); event.target.value="";
    }}/>}
    <EditorContent editor={editor} />
    <button type="button" className="r-format-toggle" aria-label={`Format ${label}`} aria-expanded={tools} onMouseDown={e => e.preventDefault()} onClick={() => setTools(!tools)}>Aa</button>
    {mention && editor.view.dom.isConnected && createPortal(<div className="r-slash-menu r-mention-menu" role="listbox" aria-label="Mention people, issues or projects" style={{
      left:Math.max(8,Math.min(editor.view.coordsAtPos(selection.from).left,window.innerWidth-290)),
      top:Math.max(8,Math.min(editor.view.coordsAtPos(selection.from).bottom+6,window.innerHeight-320)),
    }}>{mention.items.length ? <>
      {(["people", "issues", "projects"] as const).map(group => {
        const rows = mention.groups?.[group] ?? [];
        if (!rows.length) return null;
        return <div className="r-mention-section" key={group}><p className="r-mention-group">{group === "people" ? "People" : group === "issues" ? "Issues" : "Projects"}</p>
          {rows.map(item => {
            const index = mention.items.indexOf(item);
            return <button type="button" role="option" aria-selected={index===Math.min(slashIndex,mention.items.length-1)} key={`${item.kind}:${item.id}`}
              onMouseDown={event=>event.preventDefault()} onClick={()=>chooseMention(item)}>{item.label}</button>;
          })}</div>;
      })}
    </> : <p>No matching people, issues or projects</p>}</div>,editor.view.dom.closest(".r-dialog") ?? document.body)}
    {slash && editor.view.dom.isConnected && createPortal(<div className="r-slash-menu" role="listbox" aria-label="Insert block" style={{
      left:Math.max(8,Math.min(editor.view.coordsAtPos(selection.from).left,window.innerWidth-250)),
      top:Math.max(8,Math.min(editor.view.coordsAtPos(selection.from).bottom+6,window.innerHeight-320)),
    }}>
      {slash.items.length ? slash.items.map((item,index) => <button type="button" role="option" aria-selected={index===Math.min(slashIndex,slash.items.length-1)} key={item.name}
        onMouseDown={event=>event.preventDefault()} onClick={()=>chooseInsertion(index)}>{item.name}</button>) : <p>No matching blocks</p>}
    </div>,editor.view.dom.closest(".r-dialog") ?? document.body)}
    {show && createPortal(<div ref={panel} className="r-format-panel" style={{ left, top }} onKeyDown={event => {
      keyDown(event);
      if (!["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || event.target instanceof HTMLInputElement) return;
      const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault(); event.stopPropagation();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>
      <div role="toolbar" aria-label="Text formatting" className="r-format-toolbar">
        <button type="button" aria-label="Text style" title="Text style" onMouseDown={e => e.preventDefault()} onClick={() => setMenu(menu === "blocks" ? null : "blocks")}>Aa⌄</button>
        {tool("Bold", "B", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
        {tool("Italic", "I", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
        {tool("Strikethrough", "S̶", () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"))}
        {tool("Underline", "U̲", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
        <button type="button" aria-label="Link" title="Link" onMouseDown={e => e.preventDefault()} onClick={() => { setUrl(editor.getAttributes("link").href ?? ""); setError(""); setMenu(menu === "link" ? null : "link"); }}>↗</button>
        {tool("Quote", "❞", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
        {tool("Divider", "―", () => editor.chain().focus().setHorizontalRule().run())}
        {tool("Inline code", "‹/›", () => editor.chain().focus().toggleCode().run(), editor.isActive("code"))}
        {tool("Code block", "{ }", () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive("codeBlock"))}
        <button type="button" aria-label="Lists" title="Lists" onMouseDown={e => e.preventDefault()} onClick={() => setMenu(menu === "lists" ? null : "lists")}>☷⌄</button>
        {tool("Table", "▦", () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
        {tool("Toggle", "▾", () => editor.chain().focus().insertContent({type:"details",attrs:{open:true},content:[{type:"detailsSummary",content:[{type:"text",text:"Section title"}]},{type:"detailsContent",content:[{type:"paragraph"}]}]}).run())}
        <button type="button" className="r-ai-entry" title="AI writing is unavailable in this offline replica" aria-label="Ask AI (unavailable offline)" disabled>✦</button>
        {editor.isActive("table") && <>
          {tool("Add row", "+ Row", () => editor.chain().focus().addRowAfter().run())}
          {tool("Add column", "+ Col", () => editor.chain().focus().addColumnAfter().run())}
          {tool("Delete row", "− Row", () => editor.chain().focus().deleteRow().run())}
          {tool("Delete column", "− Col", () => editor.chain().focus().deleteColumn().run())}
          {tool("Merge cells", "Merge", () => editor.chain().focus().mergeCells().run())}
          {tool("Split cell", "Split", () => editor.chain().focus().splitCell().run())}
          {tool("Delete table", "× Table", () => editor.chain().focus().deleteTable().run())}
          {tool("Continue below table", "↓ Text", () => editor.chain().focus().command(({tr,state})=>{
            const table=findParentNode(node=>node.type.name==="table")(state.selection);
            if(!table)return false;
            const pos=table.pos+table.node.nodeSize;
            tr.insert(pos,state.schema.nodes.paragraph.create());
            tr.setSelection(TextSelection.near(tr.doc.resolve(pos+1)));
            return true;
          }).run())}
        </>}
        {tool("Clear formatting", "Tx", () => editor.chain().focus().unsetAllMarks().clearNodes().run())}
      </div>
      {menu === "blocks" && <div role="menu" aria-label="Text style" className="r-format-menu">
        {tool("Paragraph", "Normal text", () => editor.chain().focus().setParagraph().run())}
        {([1, 2, 3] as const).map(level => <button key={level} type="button" onMouseDown={e => e.preventDefault()} onClick={() => run(() => { editor.chain().focus().toggleHeading({ level }).run(); })}>Heading {level}</button>)}
        {insertion.filter(item => ["Callout","Collapsible section","Table"].includes(item.name)).map(item =>
          <button key={item.name} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>run(item.run)}>{item.name}</button>)}
      </div>}
      {menu === "lists" && <div role="menu" aria-label="List style" className="r-format-menu">
        {tool("Bullet list", "• Bullet list", () => editor.chain().focus().toggleBulletList().run())}
        {tool("Numbered list", "1. Numbered list", () => editor.chain().focus().toggleOrderedList().run())}
        {tool("Checklist", "☑ Checklist", () => editor.chain().focus().toggleTaskList().run())}
      </div>}
      {menu === "link" && <form className="r-link-form" onSubmit={e => {
        e.preventDefault(); e.stopPropagation();
        if (!url.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
        else if (safeLink(url.trim())) editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
        else { setError("Enter an https, http, or email link."); return; }
        setMenu(null);
      }}>
        <input autoFocus aria-label="Link URL" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} />
        <button type="submit">Apply</button>
        <button type="button" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setMenu(null); }}>Remove</button>
        {error && <p role="alert">{error}</p>}
      </form>}
    </div>, editor.view.dom.closest(".r-dialog") ?? document.body)}
  </div>;
}

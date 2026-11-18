// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { Editor } from "@tiptap/react";
import { richTextExtensions, safeLink } from "./rich-text";
import { Workspace, initialData, migrateData } from "./workspace";
function create(content = "") {
  return new Editor({ extensions: richTextExtensions(), content, contentType: "markdown" });
}

describe("rich documents", () => {
  test("tables retain merged cells, formatting and paragraphs after saving and reopening", () => {
    const editor=create();
    editor.commands.setContent({type:"doc",content:[{type:"table",content:[
      {type:"tableRow",content:[{type:"tableHeader",attrs:{colspan:2},content:[{type:"paragraph",content:[{type:"text",text:"Shared header",marks:[{type:"bold"}]}]}]}]},
      {type:"tableRow",content:[{type:"tableCell",content:[{type:"paragraph",content:[{type:"text",text:"First"}]},{type:"paragraph",content:[{type:"text",text:"Second"}]}]},{type:"tableCell",content:[{type:"paragraph",content:[{type:"text",text:"Pipe | value"}]}]}]},
    ]}]});
    const markdown=editor.getMarkdown(),reopened=create(markdown);
    expect(markdown).toContain('colspan="2"');
    expect(reopened.getJSON()).toEqual(editor.getJSON());
    reopened.destroy();editor.destroy();
  });
  test("nested callouts and collapsible sections preserve summary, body and open state", () => {
    const editor=create();
    editor.commands.setContent({type:"doc",content:[{type:"callout",content:[{type:"details",attrs:{open:true},content:[
      {type:"detailsSummary",content:[{type:"text",text:"Release notes"}]},
      {type:"detailsContent",content:[{type:"paragraph",content:[{type:"text",text:"Decision",marks:[{type:"bold"}]}]},{type:"callout",content:[{type:"paragraph",content:[{type:"text",text:"Nested note"}]}]}]},
    ]}]}]});
    const w=new Workspace(initialData());const issue=w.createIssue({title:"Structured blocks",body:editor.getMarkdown()});
    const reopened=create(migrateData(w.getSnapshot()).issues.find(i=>i.id===issue.id)!.body);
    expect(reopened.getJSON()).toEqual(editor.getJSON());
    expect(reopened.getHTML()).toContain("Release notes");
    reopened.destroy();editor.destroy();
  });
  test("mentions retain literal names and stable references without allowing arbitrary navigation",()=>{
    const editor=create();
    editor.commands.setContent({type:"doc",content:[{type:"paragraph",content:[
      {type:"mention",attrs:{kind:"user",id:'owner" ]',label:'Owner "[x]" <script>'}},
      {type:"text",text:" "},{type:"mention",attrs:{kind:"issue",id:"XXH-1",label:"XXH-1 Work"}},
      {type:"text",text:" "},{type:"mention",attrs:{kind:"project",id:"project-a",label:"Project A"}},
    ]}]});
    const reopened=create(editor.getMarkdown());expect(reopened.getJSON()).toEqual(editor.getJSON());
    const dom=document.createElement("div");dom.innerHTML=reopened.getHTML();
    expect(dom.querySelector("script")).toBeNull();
    expect([...dom.querySelectorAll("a")].map(a=>a.getAttribute("href"))).toEqual(["#/issue/XXH-1","#/project/project-a"]);
    reopened.destroy();editor.destroy();
  });
  test("formatting survives serialization, workspace persistence and reopening", () => {
    const editor = create("# Plan\n\n**Bold** and *italic*, ~~removed~~ and <u>underlined</u>\n\n- First\n- Second\n\n1. Step\n2. Next\n\n- [x] Complete\n- [ ] Pending\n\n> A quote\n\n```ts\nconst count = 3;\n```\n\n[Docs](https://example.com/docs)");
    const html = editor.getHTML();
    for (const tag of ["<h1>", "<strong>", "<em>", "<s>", "<u>", "<ul>", "<ol>", "<blockquote>", "<pre>"])
      expect(html).toContain(tag);
    expect(html).toContain('data-checked="true"');
    const w = new Workspace(initialData());
    const issue = w.createIssue({ title: "Formatted document", body: editor.getMarkdown() });
    const restored = new Workspace(migrateData(w.getSnapshot()));
    const reopened = create(restored.getSnapshot().issues.find(i => i.id === issue.id)!.body);
    expect(reopened.getJSON()).toEqual(editor.getJSON());
    reopened.destroy(); editor.destroy();
  });
  test("undo restores text formatting and redo reapplies it", () => {
    const editor = create("Select me");
    editor.commands.selectAll(); editor.commands.toggleBold();
    expect(editor.getHTML()).toContain("<strong>Select me</strong>");
    editor.commands.undo(); expect(editor.getHTML()).not.toContain("<strong>");
    editor.commands.redo(); expect(editor.getHTML()).toContain("<strong>");
    editor.commands.setContent("", { contentType: "markdown" });
    expect(editor.isEmpty).toBe(true);
    editor.destroy();
  });
  test("unsafe URLs and markup do not become executable links or elements", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,hello", "file:///etc/passwd", "https://a b"])
      expect(safeLink(url)).toBe(false);
    expect(safeLink("https://example.com/docs")).toBe(true);
    expect(safeLink("mailto:hello@example.com")).toBe(true);
    const editor = create('<script>alert(1)</script>\n\n[Bad](javascript:alert(1))\n\n<img src=x onerror=alert(1)>');
    const dom = document.createElement("div"); dom.innerHTML = editor.getHTML();
    expect(dom.querySelector("script,img,[onerror],a[href^='javascript:']")).toBeNull();
    editor.destroy();
  });
  test("rich comments keep authored content separate from activity summaries", () => {
    const w = new Workspace(initialData()); const issue = w.createIssue({title:"Comment"});
    w.comment(issue.id, "**Decision**\n\n- Confirmed");
    const restored = migrateData(w.getSnapshot());
    const activity = restored.activity.find(a => a.kind === "comment")!;
    expect(activity.author).toBe(restored.settings.user);
    expect(activity.body).toBe("**Decision**\n\n- Confirmed");
    expect(activity.text).toContain("Decision");
  });
});

// Regression: React portal submit events still bubble through the component tree.
test("applying a link never submits the surrounding issue form", async () => {
  const { createElement, act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { RichEditor } = await import("./rich-editor");
  const host = document.createElement("div"); document.body.append(host);
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });
  const rect = { left: 10, right: 20, top: 100, bottom: 120, width: 10, height: 20, x: 10, y: 100, toJSON: () => ({}) };
  Object.defineProperty(Range.prototype, "getClientRects", { value: () => [rect], configurable: true });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => rect, configurable: true });
  const root = createRoot(host); let submissions = 0;
  await act(async () => root.render(createElement("form", { onSubmit: (e: {preventDefault: () => void}) => { e.preventDefault(); submissions++; } }, createElement(RichEditor, { label: "Description", value: "Link text", onChange: () => {} }))));
  const click = async (name: string) => {
    const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
    expect(button).toBeTruthy();
    await act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  };
  await click("Format Description"); await click("Link");
  const form = document.querySelector<HTMLFormElement>(".r-link-form")!;
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(submissions).toBe(0);
  await act(async () => root.unmount()); host.remove();
});

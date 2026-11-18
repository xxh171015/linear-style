import { summarizeIssues, uid, type WorkspaceData } from "./workspace";
import type { AgentMessage } from "./types";
export interface AgentAdapter {
  reply(text: string, data: WorkspaceData): Promise<AgentMessage>;
}
/** Explicit local service boundary. Never implies a remote model or network write. */
export const localAgent: AgentAdapter = {
  async reply(text, data) {
    const lower = text.toLowerCase();
    let issues = data.issues;
    if (/create.*project|draft.*project|创建.*项目|起草.*项目/.test(lower)) {
      const name = text
        .replace(
          /^(?:create|draft)\s+(?:a\s+)?(?:new\s+)?project\s*[:：]?\s*|^(?:创建|起草)项目\s*[:：]?\s*/i,
          "",
        )
        .trim();
      return {
        id: uid("message"),
        role: "assistant",
        text: "Here is a local project proposal. Review its name and summary before saving.",
        projectDraft: { name: name || "Untitled project", description: "" },
      };
    }
    if (/set up.*team|setup.*team|创建.*团队/.test(lower))
      return {
        id: uid("message"),
        role: "assistant",
        text: "This local workspace currently contains one team, Xxh. Creating a separate hosted team requires the Linear service. No team was created.",
      };

    const id = text.match(/\b[A-Z]+-\d+\b/i)?.[0].toUpperCase();
    if (id) {
      issues = issues.filter((i) => i.id === id);
      return {
        id: uid("message"),
        role: "assistant",
        text: issues[0]
          ? `${issues[0].id} · ${issues[0].title}\n\n${issues[0].body || "No description"}\n\nStatus: ${issues[0].status}\nAssignee: ${issues[0].assignee ?? "Unassigned"}`
          : `No issue found for ${id}.`,
        issueIds: issues.map((i) => i.id),
      };
    }
    if (/draft|create.*issue|起草|创建.*任务/.test(lower)) {
      const title = text
        .replace(
          /^(?:draft(?:\s+(?:an?\s+)?issue)?|create\s+(?:an?\s+)?issue|起草|创建任务)\s*[:：]?\s*/i,
          "",
        )
        .trim();
      return {
        id: uid("message"),
        role: "assistant",
        text: "Here is a local issue draft. Review it before creating the issue.",
        draft: { title: title || "Untitled issue", body: "" },
      };
    }
    if (/summary|summari|overview|report|摘要|汇总|总结/.test(lower)) {
      const project = data.projects.find((p) =>
        lower.includes(p.name.toLowerCase()),
      );
      if (project) issues = issues.filter((i) => i.projectId === project.id);
      return {
        id: uid("message"),
        role: "assistant",
        text: summarizeIssues(issues, data),
        issueIds: issues.map((i) => i.id),
      };
    }
    const query = text
      .replace(/^(find|search|搜索|查找)\s*[:：]?\s*/i, "")
      .trim()
      .toLowerCase();
    issues = issues.filter((i) =>
      `${i.id} ${i.title} ${i.body}`.toLowerCase().includes(query),
    );
    return {
      id: uid("message"),
      role: "assistant",
      text: issues.length
        ? summarizeIssues(issues, data)
        : "No matching issues. I can search local issues, summarize your work, look up an issue ID, or draft an issue. Use “Summary”, “Find …”, or “Draft issue: …”.",
      issueIds: issues.map((i) => i.id),
    };
  },
};

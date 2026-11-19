import { HTTPError } from "./workspaces";
import type { AgentMessage } from "../src/types";
import { uid } from "../src/workspace";

export async function modelReply(
  baseUrl: string,
  apiKey: string,
  model: string | undefined,
  text: string,
  digest: string,
) {
  const origin = new URL(baseUrl);
  if (!["http:", "https:"].includes(origin.protocol)) throw new HTTPError(400, "Model URL must be http or https.");
  const endpoint = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || "default",
      messages: [
        {
          role: "system",
          content:
            "You are Agent for this Workspace. You may search and summarize issues, draft issues or projects, and propose a Coding session. Never approve, merge, or comment on GitHub. If you draft an issue, include a JSON object {\"draft\":{\"title\":\"...\",\"body\":\"...\"}}. If you propose a Coding session, include {\"codingSession\":{\"issueId\":\"TEAM-1\"}}.",
        },
        { role: "user", content: `Workspace issues:\n${digest}\n\n${text}` },
      ],
    }),
  });
  const payload = (await response.json().catch(() => undefined)) as
    | { choices?: { message?: { content?: string } }[]; error?: { message?: string } }
    | undefined;
  if (!response.ok) throw new HTTPError(502, payload?.error?.message || "The model request failed.");
  const content = payload?.choices?.[0]?.message?.content ?? "";
  const message: AgentMessage = { id: uid("message"), role: "assistant", text: content || "The model returned an empty reply." };
  const jsonMatch = content.match(/\{[\s\S]*"(?:draft|projectDraft|codingSession)"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        draft?: { title?: string; body?: string };
        projectDraft?: { name?: string; description?: string };
        codingSession?: { issueId?: string };
      };
      if (parsed.draft?.title) message.draft = { title: parsed.draft.title, body: parsed.draft.body ?? "" };
      if (parsed.projectDraft?.name)
        message.projectDraft = { name: parsed.projectDraft.name, description: parsed.projectDraft.description ?? "" };
      if (parsed.codingSession?.issueId) message.issueIds = [parsed.codingSession.issueId];
    } catch {
      /* Keep the raw model text. */
    }
  }
  return message;
}

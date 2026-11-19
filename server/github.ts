import { HTTPError } from "./workspaces";
import { parsePullRequestURL, repoAllowed, type GitHubPullRef } from "../src/github";
import type { Review } from "../src/types";

type FetchFn = typeof fetch;

async function githubJSON(token: string, path: string, init: RequestInit = {}, fetchImpl: FetchFn = fetch) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "yunjing-replica",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : undefined;
  } catch {
    throw new HTTPError(502, "GitHub returned invalid JSON.");
  }
  if (!response.ok) {
    const message =
      value && typeof value === "object" && "message" in value && typeof value.message === "string"
        ? value.message
        : "GitHub request failed.";
    throw new HTTPError(502, message);
  }
  return value;
}

export async function githubLogin(token: string, fetchImpl: FetchFn = fetch) {
  const user = (await githubJSON(token, "/user", {}, fetchImpl)) as { login?: string };
  if (!user?.login) throw new HTTPError(400, "This GitHub token could not identify a user.");
  return user.login;
}

export function assertAllowed(repos: string[], ref: GitHubPullRef) {
  if (!repoAllowed(repos, ref.owner, ref.repo))
    throw new HTTPError(403, "This repository is not on the Workspace GitHub allow list.");
}

export async function fetchPullReview(
  token: string,
  ref: GitHubPullRef,
  fetchImpl: FetchFn = fetch,
): Promise<Partial<Review>> {
  const pr = (await githubJSON(token, `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`, {}, fetchImpl)) as Record<string, unknown>;
  const sha = (pr.head as { sha?: string } | undefined)?.sha;
  const [files, comments, combined, runs] = await Promise.all([
    githubJSON(token, `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files`, {}, fetchImpl) as Promise<Record<string, unknown>[]>,
    githubJSON(token, `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments`, {}, fetchImpl) as Promise<Record<string, unknown>[]>,
    sha
      ? (githubJSON(token, `/repos/${ref.owner}/${ref.repo}/commits/${sha}/status`, {}, fetchImpl).catch(() => ({ statuses: [] })) as Promise<{
          statuses?: { context?: string; state?: string }[];
        }>)
      : Promise.resolve({ statuses: [] }),
    githubJSON(
      token,
      `/repos/${ref.owner}/${ref.repo}/actions/runs${sha ? `?head_sha=${encodeURIComponent(sha)}` : ""}`,
      {},
      fetchImpl,
    ).catch(() => ({ workflow_runs: [] })),
  ]);
  const fileList = Array.isArray(files) ? files : [];
  const commentList = Array.isArray(comments) ? comments : [];
  const diff = fileList
    .map((file) => {
      const filename = String(file.filename ?? "");
      const patch = typeof file.patch === "string" ? file.patch : "";
      return `diff --git a/${filename} b/${filename}\n${patch}`;
    })
    .join("\n");
  const workflowRuns = Array.isArray((runs as { workflow_runs?: unknown[] }).workflow_runs)
    ? ((runs as { workflow_runs: { name?: string; conclusion?: string; status?: string; head_sha?: string }[] }).workflow_runs)
    : [];
  const checks = [
    ...(combined.statuses ?? []).map((item) => ({ name: String(item.context ?? "status"), state: String(item.state ?? "pending") })),
    ...workflowRuns
      .filter((run) => !sha || run.head_sha === sha)
      .map((run) => ({ name: String(run.name ?? "Actions"), state: String(run.conclusion ?? run.status ?? "pending") })),
  ];
  let status: Review["status"] = "review";
  if (pr.merged) status = "merged";
  else if (pr.draft) status = "draft";
  else if (pr.state === "closed") status = "closed";
  const user = pr.user as { login?: string } | undefined;
  return {
    title: String(pr.title ?? `Pull request ${ref.number}`),
    author: user?.login ?? "",
    url: String(pr.html_url ?? `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`),
    status,
    approved: status === "merged",
    diff,
    files: fileList.map((file) => ({
      filename: String(file.filename ?? ""),
      status: String(file.status ?? "modified"),
      patch: typeof file.patch === "string" ? file.patch : undefined,
    })),
    comments: commentList.map((comment) => {
      const author = (comment.user as { login?: string } | undefined)?.login ?? "";
      return {
        id: `gh-${comment.id}`,
        author,
        body: String(comment.body ?? ""),
        time: String(comment.created_at ?? ""),
        githubId: Number(comment.id),
      };
    }),
    github: { ...ref, headSha: sha },
    reviewers: [],
    checks,
  };
}

export async function githubTransition(
  token: string,
  ref: GitHubPullRef,
  action: "approve" | "request-changes" | "merge",
  fetchImpl: FetchFn = fetch,
) {
  if (action === "merge") {
    await githubJSON(token, `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/merge`, { method: "PUT", body: "{}" }, fetchImpl);
    return;
  }
  await githubJSON(
    token,
    `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews`,
    {
      method: "POST",
      body: JSON.stringify({ event: action === "approve" ? "APPROVE" : "REQUEST_CHANGES" }),
    },
    fetchImpl,
  );
}

export async function githubComment(token: string, ref: GitHubPullRef, body: string, fetchImpl: FetchFn = fetch) {
  await githubJSON(
    token,
    `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments`,
    { method: "POST", body: JSON.stringify({ body }) },
    fetchImpl,
  );
}

export { parsePullRequestURL, repoAllowed };

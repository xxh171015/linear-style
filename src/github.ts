export type GitHubPullRef = { owner: string; repo: string; number: number };

const PULL = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/(?:files|commits|checks)?)?(?:[?#].*)?$/i;

export function parsePullRequestURL(url: string): GitHubPullRef | undefined {
  const match = PULL.exec(url.trim());
  if (!match) return undefined;
  return { owner: match[1], repo: match[2].replace(/\.git$/i, ""), number: Number(match[3]) };
}

export function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}

export function repoAllowed(repos: string[], owner: string, repo: string): boolean {
  const key = repoKey(owner, repo);
  return repos.some((item) => item.trim().toLowerCase() === key);
}

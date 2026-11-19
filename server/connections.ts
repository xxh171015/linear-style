import type { DatabaseSync } from "node:sqlite";
import { HTTPError } from "./workspaces";
import type { ConnectionKind, ConnectionStatus } from "../src/types";

export type GithubConfig = { repos: string[]; login?: string };
export type ModelConfig = { baseUrl: string; model?: string };
export type CodingConfig = { argv: string[]; cwd: string };

export function connectionStore(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_connections(
    workspace_id TEXT NOT NULL REFERENCES workspaces(user_id),
    kind TEXT NOT NULL CHECK(kind IN ('github','model','coding')),
    secret TEXT NOT NULL,
    config TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(workspace_id, kind)
  );`);
  function row(workspaceId: string, kind: ConnectionKind) {
    return db.prepare("SELECT secret,config FROM workspace_connections WHERE workspace_id=? AND kind=?").get(workspaceId, kind) as
      | { secret: string; config: string }
      | undefined;
  }
  function put(workspaceId: string, kind: ConnectionKind, secret: string, config: unknown) {
    db.prepare(
      "INSERT INTO workspace_connections(workspace_id,kind,secret,config,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(workspace_id,kind) DO UPDATE SET secret=excluded.secret,config=excluded.config,updated_at=excluded.updated_at",
    ).run(workspaceId, kind, secret, JSON.stringify(config), new Date().toISOString());
  }
  function remove(workspaceId: string, kind: ConnectionKind) {
    if (!db.prepare("DELETE FROM workspace_connections WHERE workspace_id=? AND kind=?").run(workspaceId, kind).changes)
      throw new HTTPError(404, "Connection not found.");
  }
  function status(workspaceId: string): ConnectionStatus {
    const github = row(workspaceId, "github");
    const model = row(workspaceId, "model");
    const coding = row(workspaceId, "coding");
    const githubConfig = github ? (JSON.parse(github.config) as GithubConfig) : undefined;
    const modelConfig = model ? (JSON.parse(model.config) as ModelConfig) : undefined;
    const codingConfig = coding ? (JSON.parse(coding.config) as CodingConfig) : undefined;
    return {
      github: github ? { connected: true, repos: githubConfig?.repos ?? [], login: githubConfig?.login } : { connected: false, repos: [] },
      model: model ? { connected: true, baseUrl: modelConfig?.baseUrl, model: modelConfig?.model } : { connected: false },
      coding: coding
        ? { configured: true, argv: codingConfig?.argv, cwd: codingConfig?.cwd }
        : { configured: false },
    };
  }
  return { row, put, remove, status };
}

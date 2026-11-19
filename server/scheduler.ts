import type { DatabaseSync } from "node:sqlite";
import { decodeWorkspace, encodeWorkspace } from "../src/workspace-wire";
import { Workspace } from "../src/workspace";
import { offlineServices, type ServiceAdapters } from "../src/services";
import { blankPersonal, HTTPError, hydrateShared, split } from "./workspaces";

export type WorkspaceJobHooks = {
  codingConfigured?(workspaceId: string): boolean;
};

function servicesFor(workspaceId: string, hooks?: WorkspaceJobHooks): ServiceAdapters {
  return {
    ...offlineServices,
    automations: {
      ...offlineServices.automations,
      codingConfigured: () => Boolean(hooks?.codingConfigured?.(workspaceId)),
    },
  };
}

export async function applySharedWorkspace(
  db: DatabaseSync,
  workspaceId: string,
  fn: (workspace: Workspace) => void | Promise<void>,
  hooks?: WorkspaceJobHooks,
) {
  const row = db.prepare("SELECT data,revision FROM workspaces WHERE user_id=?").get(workspaceId) as
    | { data: string; revision: number }
    | undefined;
  if (!row) throw new HTTPError(404, "Workspace not found.");
  const stored = JSON.parse(row.data) as Record<string, unknown>;
  const workspace = new Workspace(
    decodeWorkspace(hydrateShared(stored, blankPersonal())),
    undefined,
    servicesFor(workspaceId, hooks),
  );
  await fn(workspace);
  const next = workspace.getSnapshot();
  const encoded = await encodeWorkspace(next);
  const { shared } = split(encoded);
  const nextShared = { ...shared, revision: row.revision + 1 };
  db.exec("BEGIN IMMEDIATE");
  try {
    const updated = db.prepare("UPDATE workspaces SET revision=?,data=? WHERE user_id=? AND revision=?").run(
      row.revision + 1,
      JSON.stringify(nextShared),
      workspaceId,
      row.revision,
    );
    if (updated.changes !== 1) throw new HTTPError(409, "The workspace changed in another session.");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return next;
}

export async function tickWorkspaceRow(
  db: DatabaseSync,
  workspaceId: string,
  now = new Date(),
  hooks?: WorkspaceJobHooks,
) {
  const row = db.prepare("SELECT data,revision FROM workspaces WHERE user_id=?").get(workspaceId) as
    | { data: string; revision: number }
    | undefined;
  if (!row) return { changed: false, confirmations: [] as ReturnType<Workspace["getSnapshot"]>["inbox"] };
  const stored = JSON.parse(row.data) as Record<string, unknown>;
  const data = decodeWorkspace(hydrateShared(stored, blankPersonal()));
  const workspace = new Workspace(data, undefined, servicesFor(workspaceId, hooks));
  workspace.tick(now);
  const next = workspace.getSnapshot();
  const confirmations = next.inbox.filter((item) => item.kind === "confirmation");
  const encoded = await encodeWorkspace(next);
  const { shared } = split(encoded);
  const nextShared = { ...shared, revision: row.revision + 1 };
  if (JSON.stringify({ ...stored, revision: 0 }) === JSON.stringify({ ...nextShared, revision: 0 }) && !confirmations.length)
    return { changed: false, confirmations };
  db.exec("BEGIN IMMEDIATE");
  try {
    const updated = db.prepare("UPDATE workspaces SET revision=?,data=? WHERE user_id=? AND revision=?").run(
      row.revision + 1,
      JSON.stringify(nextShared),
      workspaceId,
      row.revision,
    );
    if (updated.changes !== 1) throw new HTTPError(409, "The workspace changed in another session.");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { changed: true, confirmations };
}

export function startWorkspaceJobs(
  db: DatabaseSync,
  onTick: (workspaceId: string, confirmations: ReturnType<Workspace["getSnapshot"]>["inbox"]) => void,
  hooks?: WorkspaceJobHooks,
) {
  const run = () => {
    const ids = db.prepare("SELECT user_id FROM workspaces").all() as { user_id: string }[];
    void Promise.all(
      ids.map(async (row) => {
        try {
          const result = await tickWorkspaceRow(db, row.user_id, new Date(), hooks);
          if (result.changed || result.confirmations.length) onTick(row.user_id, result.confirmations);
        } catch {
          /* Keep other workspaces ticking. */
        }
      }),
    );
  };
  const timer = setInterval(run, 60_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

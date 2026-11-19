import type { Issue, Project } from "./types";
export type RelationScope = "issue" | "project";
export type Relation = {
  id: string;
  scope: RelationScope;
  type: "blocks" | "related";
  sourceId: string;
  targetId: string;
  createdAt: string;
};
export type IssueRelationMode =
  | "parent"
  | "child"
  | "related"
  | "blocked-by"
  | "blocking"
  | "duplicate";
export const RELATION_LABEL: Record<IssueRelationMode, string> = {
  parent: "Parent of…",
  child: "Sub-issue of…",
  related: "Related to…",
  "blocked-by": "Blocked by…",
  blocking: "Blocking…",
  duplicate: "Duplicate of…",
};
export function canonicalPair(
  type: Relation["type"],
  sourceId: string,
  targetId: string,
) {
  return type === "related" && sourceId > targetId
    ? { sourceId: targetId, targetId: sourceId }
    : { sourceId, targetId };
}
export function relationKey(
  relation: Pick<Relation, "scope" | "type" | "sourceId" | "targetId">,
) {
  const pair = canonicalPair(
    relation.type,
    relation.sourceId,
    relation.targetId,
  );
  return JSON.stringify([
    relation.scope,
    relation.type,
    pair.sourceId,
    pair.targetId,
  ]);
}
export function validateRelations(
  relations: Relation[],
  issues: Pick<Issue, "id">[],
  projects: Pick<Project, "id">[],
) {
  const entities = {
    issue: new Set(issues.map((i) => i.id)),
    project: new Set(projects.map((p) => p.id)),
  };
  const keys = new Set<string>();
  for (const relation of relations) {
    if (
      !relation ||
      !["issue", "project"].includes(relation.scope) ||
      !["blocks", "related"].includes(relation.type) ||
      typeof relation.sourceId !== "string" ||
      typeof relation.targetId !== "string" ||
      !entities[relation.scope].has(relation.sourceId) ||
      !entities[relation.scope].has(relation.targetId)
    )
      throw Error("A relationship references an unavailable item.");
    if (relation.sourceId === relation.targetId)
      throw Error("An item cannot be related to itself.");
    const key = relationKey(relation);
    if (keys.has(key)) throw Error("This relationship already exists.");
    keys.add(key);
  }
  for (const scope of ["issue", "project"] as const) {
    const next = new Map<string, string[]>(),
      degree = new Map<string, number>();
    for (const edge of relations.filter(
      (r) => r.scope === scope && r.type === "blocks",
    )) {
      next.set(edge.sourceId, [
        ...(next.get(edge.sourceId) ?? []),
        edge.targetId,
      ]);
      degree.set(edge.sourceId, degree.get(edge.sourceId) ?? 0);
      degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1);
    }
    const ready = [...degree]
      .filter(([, count]) => count === 0)
      .map(([id]) => id);
    let visited = 0;
    for (let index = 0; index < ready.length; index++) {
      visited++;
      for (const id of next.get(ready[index]) ?? []) {
        const value = degree.get(id)! - 1;
        degree.set(id, value);
        if (value === 0) ready.push(id);
      }
    }
    if (visited !== degree.size)
      throw Error("Blocking relationships cannot form a cycle.");
  }
}
export function relationsFor(
  relations: Relation[],
  scope: RelationScope,
  id: string,
) {
  return relations
    .filter(
      (r) => r.scope === scope && (r.sourceId === id || r.targetId === id),
    )
    .map((relation) => ({
      relation,
      otherId: relation.sourceId === id ? relation.targetId : relation.sourceId,
      label:
        relation.type === "related"
          ? "Related to"
          : relation.sourceId === id
            ? "Blocking"
            : "Blocked by",
    }));
}
export function openBlockers(
  relations: Relation[],
  id: string,
  issues: Issue[],
) {
  const blockers = new Set(
    relations
      .filter(
        (r) => r.scope === "issue" && r.type === "blocks" && r.targetId === id,
      )
      .map((r) => r.sourceId),
  );
  return issues.filter(
    (issue) =>
      !issue.deletedAt &&
      blockers.has(issue.id) &&
      !["done", "canceled", "duplicate"].includes(issue.status),
  );
}

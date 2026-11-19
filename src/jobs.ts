import type { Cycle, Issue, IssueStatus, Loop, LoopRun, Team } from "./types";

function defaultId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export const TERMINAL_ISSUE_STATUSES: IssueStatus[] = ["done", "canceled", "duplicate"];
export const FAILED_RETRY_MS = 5 * 60 * 1000;

export function addCalendarDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function cycleDurationDays(team: Pick<Team, "cycleDurationDays">): number {
  const n = team.cycleDurationDays;
  return Number.isInteger(n) && n! > 0 && n! <= 366 ? n! : 7;
}

export function periodStart(
  trigger: Extract<Loop["trigger"], "hourly" | "daily" | "weekly">,
  now: Date,
  weekStartsOn = 1,
): string {
  const today = addCalendarDays(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    0,
  );
  if (trigger === "hourly") return `${today}T${String(now.getHours()).padStart(2, "0")}`;
  if (trigger === "daily") return today;
  const weekday = now.getDay();
  const start = ((weekStartsOn % 7) + 7) % 7;
  return addCalendarDays(today, -((weekday - start + 7) % 7));
}

export function intervalBlocked(runs: LoopRun[], loopId: string, period: string, nowMs: number): boolean {
  const matching = runs.filter((run) => run.loopId === loopId && run.periodStart === period);
  if (matching.some((run) => run.status === "completed" || run.status === "limited" || run.status === "pending"))
    return true;
  const failed = matching.filter((run) => run.status === "failed");
  if (!failed.length) return false;
  const latest = failed.reduce((a, b) => (Date.parse(a.time) > Date.parse(b.time) ? a : b));
  return nowMs - Date.parse(latest.time) < FAILED_RETRY_MS;
}

export function eventAlreadyRan(runs: LoopRun[], loopId: string, issueId: string, activityId: string): boolean {
  return runs.some(
    (run) => run.loopId === loopId && run.triggerIssueId === issueId && run.triggerActivityId === activityId,
  );
}

export function nextRotationAssignee(team: Pick<Team, "triageRotation" | "triageRotationIndex">): { assignee: string; nextIndex: number } | undefined {
  const list = (team.triageRotation ?? []).map((name) => name.trim()).filter(Boolean);
  if (!list.length) return undefined;
  const index = ((team.triageRotationIndex ?? 0) % list.length + list.length) % list.length;
  return { assignee: list[index], nextIndex: (index + 1) % list.length };
}

export function advanceCycles(
  data: { teams: Team[]; cycles: Cycle[]; issues: Issue[] },
  today: string,
  createId: (prefix: string) => string = defaultId,
): boolean {
  let changed = false;
  for (const team of data.teams) {
    const duration = cycleDurationDays(team);
    const owned = () => data.cycles.filter((cycle) => (cycle.teamKey || team.key) === team.key);
    if (!owned().length) continue;
    let guard = 0;
    while (guard++ < 400) {
      const cycles = owned().sort(
        (a, b) => a.endDate.localeCompare(b.endDate) || a.startDate.localeCompare(b.startDate),
      );
      const latest = cycles[cycles.length - 1];
      if (latest.endDate >= today) break;
      const nextStart = addCalendarDays(latest.endDate, 1);
      if (cycles.some((cycle) => cycle.startDate === nextStart)) break;
      const number = Math.max(0, ...data.cycles.map((cycle) => cycle.number)) + 1;
      data.cycles.push({
        id: createId("cycle"),
        number,
        name: `Cycle ${number}`,
        startDate: nextStart,
        endDate: addCalendarDays(nextStart, duration - 1),
        capacity: latest.capacity,
        description: "",
        teamKey: team.key,
      });
      changed = true;
    }
    const completed = owned()
      .filter((cycle) => cycle.endDate < today)
      .sort((a, b) => a.endDate.localeCompare(b.endDate));
    for (const ended of completed) {
      const next = owned().find((cycle) => cycle.startDate === addCalendarDays(ended.endDate, 1));
      if (!next) continue;
      for (const issue of data.issues) {
        if (issue.deletedAt || issue.cycleId !== ended.id) continue;
        if (TERMINAL_ISSUE_STATUSES.includes(issue.status)) continue;
        issue.cycleId = next.id;
        changed = true;
      }
    }
  }
  return changed;
}

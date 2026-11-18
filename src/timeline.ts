import type { Project } from "./types";
export type ProjectZoom = "Year" | "Quarter" | "Month" | "Week";
export type ProjectDisplay = {
  layout: "list" | "board" | "timeline";
  zoom: ProjectZoom;
  grouping: "none" | "status" | "lead" | "priority";
  ordering:
    | "Manual"
    | "Name"
    | "Health"
    | "Priority"
    | "Lead"
    | "Target date"
    | "Issues"
    | "Status";
  showClosed: boolean;
  showProjectList: boolean;
  showWeekNumbers: boolean;
  showCycles: boolean;
  showDependencies: boolean;
};
export const DEFAULT_PROJECT_DISPLAY: ProjectDisplay = {
  layout: "list",
  zoom: "Year",
  grouping: "none",
  ordering: "Manual",
  showClosed: true,
  showProjectList: true,
  showWeekNumbers: false,
  showCycles: false,
  showDependencies: false,
};
export const DAY = 86400000;
export function dateNumber(value?: string): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === value
    ? time / DAY
    : undefined;
}
export const dateString = (value: number) =>
  new Date(value * DAY).toISOString().slice(0, 10);
export function scheduleDates(startDate?: string, targetDate?: string) {
  const start = dateNumber(startDate),
    target = dateNumber(targetDate);
  if (
    (startDate && start === undefined) ||
    (targetDate && target === undefined)
  )
    throw Error("Choose valid project dates.");
  if (start !== undefined && target !== undefined && target < start)
    throw Error("Target date cannot be before start date.");
  return {
    startDate: startDate || undefined,
    targetDate: targetDate || undefined,
  };
}
export function moveSchedule(
  project: Pick<Project, "startDate" | "targetDate">,
  delta: number,
  mode: "move" | "start" | "end" = "move",
) {
  if (!Number.isInteger(delta))
    throw Error("Schedule changes must use whole days.");
  const start = dateNumber(project.startDate),
    target = dateNumber(project.targetDate);
  return scheduleDates(
    start === undefined
      ? undefined
      : dateString(start + (mode === "end" ? 0 : delta)),
    target === undefined
      ? undefined
      : dateString(target + (mode === "start" ? 0 : delta)),
  );
}
export const pixelsPerDay: Record<ProjectZoom, number> = {
  Year: 3,
  Quarter: 9,
  Month: 24,
  Week: 64,
};
export function projectSpan(
  project: Pick<Project, "startDate" | "targetDate">,
  origin: number,
  scale: number,
) {
  const start = dateNumber(project.startDate),
    end = dateNumber(project.targetDate);
  if (start === undefined && end === undefined) return undefined;
  return {
    left: ((start ?? end!) - origin) * scale,
    width:
      start !== undefined && end !== undefined
        ? Math.max(scale, (end - start + 1) * scale)
        : 0,
    start,
    end,
  };
}
export function isoWeek(day: number) {
  const date = new Date(day * DAY);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  return Math.ceil(
    ((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / DAY + 1) / 7,
  );
}

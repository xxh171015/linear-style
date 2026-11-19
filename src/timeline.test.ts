import { describe, expect, test } from "vitest";
import {
  dateNumber,
  dateString,
  DEFAULT_PROJECT_DISPLAY,
  isoWeek,
  moveSchedule,
  projectSpan,
  scheduleDates,
} from "./timeline";
import {
  initialData,
  migrateData,
  Workspace,
  type WorkspaceData,
} from "./workspace";

describe("project timeline scheduling", () => {
  test("strict calendar days reject rollover and spans include the target day", () => {
    expect(dateNumber("2026-02-30")).toBeUndefined();
    expect(dateNumber("2024-02-29")).toBeDefined();
    expect(dateNumber("2026-2-01")).toBeUndefined();
    expect(() => scheduleDates("2026-12-01", "2026-11-01")).toThrow("before");
    const origin = dateNumber("2026-03-01")!;
    expect(
      projectSpan(
        { startDate: "2026-03-02", targetDate: "2026-03-04" },
        origin,
        10,
      ),
    ).toMatchObject({ left: 10, width: 30 });
    expect(projectSpan({}, origin, 10)).toBeUndefined();
    expect(projectSpan({ targetDate: "2026-03-04" }, origin, 10)).toMatchObject(
      { left: 30, width: 0, start: undefined },
    );
  });
  test("moving and resizing preserve calendar dates across DST, leap days and year boundaries", () => {
    expect(
      moveSchedule({ startDate: "2026-03-07", targetDate: "2026-03-10" }, 2),
    ).toEqual({ startDate: "2026-03-09", targetDate: "2026-03-12" });
    expect(
      moveSchedule({ startDate: "2024-02-28", targetDate: "2024-02-29" }, 1),
    ).toEqual({ startDate: "2024-02-29", targetDate: "2024-03-01" });
    expect(
      moveSchedule(
        { startDate: "2026-12-30", targetDate: "2026-12-31" },
        2,
        "end",
      ),
    ).toEqual({ startDate: "2026-12-30", targetDate: "2027-01-02" });
    expect(moveSchedule({ targetDate: "2026-12-31" }, 1)).toEqual({
      startDate: undefined,
      targetDate: "2027-01-01",
    });
    expect(() =>
      moveSchedule(
        { startDate: "2026-12-30", targetDate: "2026-12-31" },
        2,
        "start",
      ),
    ).toThrow("before");
    expect(isoWeek(dateNumber("2027-01-01")!)).toBe(53);
    expect(dateString(dateNumber("2027-01-01")!)).toBe("2027-01-01");
  });
  test("project date edits are atomic and retain all other project fields", () => {
    const w = new Workspace(initialData()),
      project = w.getSnapshot().projects[0];
    const before = w.getSnapshot();
    expect(() =>
      w.setProjectSchedule(project.id, "2026-12-02", "2026-12-01"),
    ).toThrow();
    expect(w.getSnapshot()).toBe(before);
    expect(() => w.setProjectSchedule("missing", "2026-12-01")).toThrow(
      "not found",
    );
    expect(w.getSnapshot()).toBe(before);
    w.setProjectSchedule(project.id, "2026-12-01", "2026-12-12");
    expect(w.getSnapshot().projects[0]).toEqual({
      ...project,
      startDate: "2026-12-01",
      targetDate: "2026-12-12",
    });
    w.setProjectSchedule(project.id, "", "");
    expect(w.getSnapshot().projects[0].startDate).toBeUndefined();
    expect(w.getSnapshot().projects[0].targetDate).toBeUndefined();
  });
  test("view preferences and dates persist independently, and old backups still load", async () => {
    let saved: WorkspaceData | undefined;
    const w = new Workspace(initialData(), {
      load: async () => saved,
      save: async (data) => {
        saved = structuredClone(data);
      },
    });
    const id = w.getSnapshot().projects[0].id;
    w.setProjectSchedule(id, "2026-12-01", "2026-12-12");
    w.mutate((d) => {
      d.projectPreferences.projects = {
        ...DEFAULT_PROJECT_DISPLAY,
        layout: "timeline",
        zoom: "Month",
      };
      d.projectPreferences["view:test"] = {
        ...DEFAULT_PROJECT_DISPLAY,
        layout: "board",
      };
    });
    await w.flushed();
    const restored = migrateData(saved);
    expect(restored.projectPreferences.projects.layout).toBe("timeline");
    expect(restored.projectPreferences["view:test"].layout).toBe("board");
    expect(restored.projects[0].targetDate).toBe("2026-12-12");
    const old = structuredClone(restored) as Partial<WorkspaceData>;
    delete old.projectPreferences;
    expect(migrateData(old).projectPreferences).toEqual({});
    restored.projectPreferences.projects.zoom = "bad" as "Month";
    expect(() => migrateData(restored)).toThrow("display preference");
  });
});

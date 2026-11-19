import { expect, test } from "vitest";
import {
  addCalendarDays,
  advanceCycles,
  eventAlreadyRan,
  intervalBlocked,
  nextRotationAssignee,
  periodStart,
} from "./jobs";
import { parsePullRequestURL, repoAllowed } from "./github";
import type { Cycle, Issue, LoopRun, Team } from "./types";

test("a completed cycle creates the next adjacent cycle and rolls unfinished work including In Review", () => {
  const team: Team = { id: "t", key: "ENG", name: "Eng", cycleDurationDays: 7 };
  const ended: Cycle = {
    id: "c1",
    number: 1,
    name: "Cycle 1",
    startDate: "2026-11-09",
    endDate: "2026-11-15",
    capacity: 8,
    description: "",
    teamKey: "ENG",
  };
  const review: Issue = {
    id: "ENG-1",
    title: "review",
    body: "",
    status: "review",
    date: "",
    labels: [],
    priority: 0,
    subscribed: false,
    teamKey: "ENG",
    cycleId: "c1",
  };
  const done: Issue = { ...review, id: "ENG-2", title: "done", status: "done" };
  const data = { teams: [team], cycles: [ended], issues: [review, done] };
  advanceCycles(data, "2026-11-16", (prefix) => `${prefix}-next`);
  expect(data.cycles).toHaveLength(2);
  expect(data.cycles[1]).toMatchObject({
    startDate: "2026-11-16",
    endDate: "2026-11-22",
    teamKey: "ENG",
  });
  expect(review.cycleId).toBe(data.cycles[1].id);
  expect(done.cycleId).toBe("c1");
  advanceCycles(data, "2026-11-16", () => "cycle-dup");
  expect(data.cycles).toHaveLength(2);
});

test("interval keys collapse a day to one run and retry only after a failed backoff", () => {
  const now = new Date("2026-11-19T15:04:00");
  expect(periodStart("daily", now)).toBe("2026-11-19");
  expect(periodStart("hourly", now)).toBe("2026-11-19T15");
  expect(addCalendarDays("2026-11-19", 1)).toBe("2026-11-20");
  const runs: LoopRun[] = [
    { id: "r1", loopId: "loop", time: "2026-11-19T10:00:00.000Z", status: "completed", result: "", issueIds: [], periodStart: "2026-11-19" },
  ];
  expect(intervalBlocked(runs, "loop", "2026-11-19", Date.parse("2026-11-19T18:00:00.000Z"))).toBe(true);
  const failed: LoopRun[] = [
    { id: "r2", loopId: "loop", time: "2026-11-19T10:00:00.000Z", status: "failed", result: "boom", issueIds: [], periodStart: "2026-11-19" },
  ];
  expect(intervalBlocked(failed, "loop", "2026-11-19", Date.parse("2026-11-19T10:01:00.000Z"))).toBe(true);
  expect(intervalBlocked(failed, "loop", "2026-11-19", Date.parse("2026-11-19T10:06:00.000Z"))).toBe(false);
  expect(eventAlreadyRan(runs, "loop", "ENG-1", "act-1")).toBe(false);
  expect(eventAlreadyRan([{ ...runs[0], triggerIssueId: "ENG-1", triggerActivityId: "act-1" }], "loop", "ENG-1", "act-1")).toBe(true);
});

test("Accept rotation walks the named list and wraps", () => {
  const team: Team = { id: "t", key: "ENG", name: "Eng", triageRotation: ["Ada", "Bea"] };
  expect(nextRotationAssignee(team)).toBe("Ada");
  expect(nextRotationAssignee(team)).toBe("Bea");
  expect(nextRotationAssignee(team)).toBe("Ada");
  expect(nextRotationAssignee({ id: "t", key: "ENG", name: "Eng" })).toBeUndefined();
});

test("only github.com pull URLs in the allowed owner/repo list parse as Reviews", () => {
  expect(parsePullRequestURL("https://github.com/acme/app/pull/41")).toEqual({
    owner: "acme",
    repo: "app",
    number: 41,
  });
  expect(parsePullRequestURL("https://example.com/acme/app/pull/41")).toBeUndefined();
  expect(repoAllowed(["acme/app"], "acme", "app")).toBe(true);
  expect(repoAllowed(["acme/app"], "acme", "other")).toBe(false);
});

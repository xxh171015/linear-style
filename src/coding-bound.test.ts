import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { boundArgv, runCodingCommand } from "../server/coding";

test("coding argv replaces whole tokens and refuses in-string interpolation", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "yunjing-coding-"));
  const bound = boundArgv(
    { argv: ["tool", "{issueId}", "{title}", "{repoPath}"], cwd, timeoutMs: 1000 },
    { issueId: "ENG-1", title: "Fix" },
  );
  expect(bound.argv[1]).toBe("ENG-1");
  expect(bound.argv[2]).toBe("Fix");
  expect(bound.argv[3]).toBe(bound.cwd);
  expect(() => boundArgv({ argv: ["tool", "--id={issueId}"], cwd, timeoutMs: 1000 }, { issueId: "ENG-1", title: "Fix" })).toThrow(/whole arguments/);
});

test("a zero-exit command completes and a missing binary fails", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "yunjing-coding-"));
  const ok = await runCodingCommand([process.execPath, "-e", "process.stdout.write('ran')"], cwd, 5000);
  expect(ok).toEqual({ status: "completed", log: "ran" });
  const bad = await runCodingCommand(["yunjing-missing-binary-xyz"], cwd, 5000);
  expect(bad.status).toBe("failed");
});

test("a missing working directory fails the Coding session", () => {
  const cwd = path.join(tmpdir(), "yunjing-missing-cwd-xyz");
  expect(() => boundArgv({ argv: ["tool"], cwd, timeoutMs: 1000 }, { issueId: "ENG-1", title: "Fix" })).toThrow(
    /does not exist/,
  );
});

test("child env is PATH, HOME, and LANG only", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "yunjing-coding-"));
  const previous = process.env.YUNJING_SECRET;
  process.env.YUNJING_SECRET = "should-not-leak";
  try {
    const result = await runCodingCommand(
      [process.execPath, "-e", "process.stdout.write(Object.keys(process.env).sort().join(','))"],
      cwd,
      5000,
    );
    expect(result.status).toBe("completed");
    const keys = result.log.split(",").filter(Boolean);
    expect(keys.filter((key) => key !== "__CF_USER_TEXT_ENCODING").every((key) => ["HOME", "LANG", "PATH"].includes(key))).toBe(true);
    expect(keys).toContain("PATH");
    expect(keys).not.toContain("YUNJING_SECRET");
    expect(keys).not.toContain("USER");
  } finally {
    if (previous === undefined) delete process.env.YUNJING_SECRET;
    else process.env.YUNJING_SECRET = previous;
  }
});

test("Coding session timeout is 30 minutes and a hung command is killed", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "yunjing-coding-"));
  const vars = { issueId: "ENG-1", title: "Fix" };
  expect(boundArgv({ argv: ["tool"], cwd, timeoutMs: 0 }, vars).timeoutMs).toBe(30 * 60 * 1000);
  expect(boundArgv({ argv: ["tool"], cwd, timeoutMs: 60 * 60 * 1000 }, vars).timeoutMs).toBe(30 * 60 * 1000);
  const started = Date.now();
  const hung = await runCodingCommand([process.execPath, "-e", "setTimeout(() => {}, 60_000)"], cwd, 250);
  expect(hung.status).toBe("failed");
  expect(Date.now() - started).toBeLessThan(10_000);
});

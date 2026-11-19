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

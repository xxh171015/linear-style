import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { boundArgv } from "../server/coding";

test("coding argv replaces whole tokens and refuses in-string interpolation", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "yunjing-coding-"));
  const bound = boundArgv({ argv: ["tool", "{issueId}", "{title}", "{repoPath}"], cwd }, { issueId: "ENG-1", title: "Fix" });
  expect(bound.argv[1]).toBe("ENG-1");
  expect(bound.argv[2]).toBe("Fix");
  expect(bound.argv[3]).toBe(bound.cwd);
  expect(() => boundArgv({ argv: ["tool", "--id={issueId}"], cwd }, { issueId: "ENG-1", title: "Fix" })).toThrow(/whole arguments/);
});

test("a missing working directory fails the Coding session", () => {
  const cwd = path.join(tmpdir(), "yunjing-missing-cwd-xyz");
  expect(() => boundArgv({ argv: ["tool"], cwd }, { issueId: "ENG-1", title: "Fix" })).toThrow(/does not exist/);
});

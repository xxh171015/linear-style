import { expect, test } from "vitest";
import { parsePullRequestURL, repoAllowed } from "./github";

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

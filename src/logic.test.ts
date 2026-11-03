import { describe, expect, test } from "vitest";
import { isSidebarNavActive } from "./logic";

describe("Sidebar Projects/Views single active row", () => {
  test("only the Workspace Projects row is active when that section last selected Projects", () => {
    expect(isSidebarNavActive("projects", "workspace", "projects", "workspace")).toBe(true);
    expect(isSidebarNavActive("projects", "team", "projects", "workspace")).toBe(false);
    expect(isSidebarNavActive("views", "workspace", "projects", "workspace")).toBe(false);
  });

  test("only the Team Views row is active when that section last selected Views", () => {
    expect(isSidebarNavActive("views", "team", "views", "team")).toBe(true);
    expect(isSidebarNavActive("views", "workspace", "views", "team")).toBe(false);
    expect(isSidebarNavActive("projects", "team", "views", "team")).toBe(false);
  });

  test("non-duplicated nav rows ignore Projects/Views section", () => {
    expect(isSidebarNavActive("inbox", "top", "inbox", "workspace")).toBe(true);
    expect(isSidebarNavActive("my-issues", "top", "inbox", "workspace")).toBe(false);
    expect(isSidebarNavActive("loops", "workspace", "loops", "team")).toBe(true);
  });
});

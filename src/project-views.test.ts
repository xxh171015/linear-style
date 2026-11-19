// @vitest-environment jsdom
import { expect, test } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { ProjectCollection } from "./project-views";
import { WorkspaceContext } from "./ui";
import { initialData, Workspace } from "./workspace";

test("date form validates the displayed date fields before committing a schedule", async () => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const w = new Workspace(initialData());
  const project = w.getSnapshot().projects[0];
  w.setProjectSchedule(project.id, "2026-11-02", "2026-11-30");
  const root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(
        WorkspaceContext.Provider,
        { value: w },
        createElement(ProjectCollection, {
          projects: w.getSnapshot().projects,
        }),
      ),
    ),
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label^="Edit dates for"]')!
      .click(),
  );
  const form = host.querySelector<HTMLFormElement>("form")!;
  const input = form.querySelector<HTMLInputElement>('[name="targetDate"]')!;
  input.value = "2026-11-01";
  const before = w.getSnapshot();
  await act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "before start date",
  );
  expect(w.getSnapshot()).toBe(before);
  expect(input.value).toBe("2026-11-01");
  input.value = "2026-12-01";
  await act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  expect(w.getSnapshot().projects[0].targetDate).toBe("2026-12-01");
  expect(host.querySelector("form")).toBeNull();
  await act(async () => root.unmount());
  host.remove();
});

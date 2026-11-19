import { describe, expect, test } from "vitest";
import { inInboxFolder, unreadInboxCount } from "./notifications";
import { initialData, migrateData, Workspace, type WorkspaceData } from "./workspace";

const now = Date.parse("2026-11-18T01:00:00Z");
const notification = { id: "notice", issueId: "XXH-1", text: "Updated", time: "2026-11-18", read: false };
function workspace() {
  const data = initialData();
  data.inbox = [{ ...notification }];
  return new Workspace(data);
}
describe("notification lifecycle", () => {
  test("folders are exclusive and a reminder becomes visible exactly when due", () => {
    const item = { ...notification, snoozedUntil: "2026-11-18T02:00:00Z" };
    expect(inInboxFolder(item, "snoozed", now)).toBe(true);
    expect(inInboxFolder(item, "inbox", now)).toBe(false);
    expect(unreadInboxCount([item], now)).toBe(0);
    expect(inInboxFolder(item, "inbox", now + 3600000)).toBe(true);
    expect(inInboxFolder(item, "snoozed", now + 3600000)).toBe(false);
    expect(unreadInboxCount([item], now + 3600000)).toBe(1);
    const archived = { ...item, archivedAt: "2026-11-18T00:00:00Z" };
    expect(inInboxFolder(archived, "archived", now)).toBe(true);
    expect(inInboxFolder(archived, "snoozed", now)).toBe(false);
    expect(unreadInboxCount([archived], now)).toBe(0);
  });
  test("archive and restore preserve read state and remove reminder", () => {
    const w = workspace();
    w.updateNotification("notice", "snooze", new Date(Date.now() + 3600000).toISOString());
    w.updateNotification("notice", "archive");
    expect(w.getSnapshot().inbox[0].archivedAt).toBeTruthy();
    expect(w.getSnapshot().inbox[0].snoozedUntil).toBeUndefined();
    w.updateNotification("notice", "restore");
    expect(w.getSnapshot().inbox[0]).toEqual(notification);
    w.updateNotification("notice", "read");
    expect(unreadInboxCount(w.getSnapshot().inbox)).toBe(0);
    w.updateNotification("notice", "unread");
    expect(unreadInboxCount(w.getSnapshot().inbox)).toBe(1);
  });
  test("invalid reminders and missing IDs fail atomically", () => {
    const w = workspace(), before = w.getSnapshot();
    for (const date of [undefined, "invalid", "2020-01-01"]) {
      expect(() => w.updateNotification("notice", "snooze", date)).toThrow("future");
      expect(w.getSnapshot()).toBe(before);
    }
    expect(() => w.updateNotification("missing", "read")).toThrow("no longer");
    expect(w.getSnapshot()).toBe(before);
  });
  test("saved reminders survive repository reload and backup migration", async () => {
    let saved: WorkspaceData | undefined;
    const data = initialData(); data.inbox = [{ ...notification }];
    const w = new Workspace(data, { load: async () => saved, save: async value => { saved = structuredClone(value); } });
    const until = new Date(Date.now() + 7200000).toISOString();
    w.updateNotification("notice", "snooze", until);
    await w.flushed();
    const restored = migrateData(saved);
    expect(restored.inbox[0].snoozedUntil).toBe(until);
    expect(inInboxFolder(restored.inbox[0], "snoozed")).toBe(true);
    restored.inbox[0].snoozedUntil = "broken";
    expect(() => migrateData(restored)).toThrow("notification");
  });
});

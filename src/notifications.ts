import type { InboxItem } from "./types";
import { useEffect, useState } from "react";

export function useNotificationTime(items: InboxItem[]) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { setNow(Date.now()); }, [items]);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const current = Date.now();
    const next = Math.min(...items.filter(item => !item.archivedAt).map(item => Date.parse(item.snoozedUntil ?? "")).filter(time => time > current));
    const timer = Number.isFinite(next) ? window.setTimeout(refresh, Math.min(next - current + 1, 2147483647)) : undefined;
    window.addEventListener("focus", refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", refresh); };
  }, [items, now]);
  return now;
}

export type InboxFolder = "inbox" | "snoozed" | "archived";
export function inInboxFolder(item: InboxItem, folder: InboxFolder, now = Date.now()) {
  if (folder === "archived") return Boolean(item.archivedAt);
  if (item.archivedAt) return false;
  const snoozed = Boolean(item.snoozedUntil && Date.parse(item.snoozedUntil) > now);
  return folder === "snoozed" ? snoozed : !snoozed;
}
export function unreadInboxCount(items: InboxItem[], now = Date.now()) {
  return items.filter((item) => !item.read && inInboxFolder(item, "inbox", now)).length;
}

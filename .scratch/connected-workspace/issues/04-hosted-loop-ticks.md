# 04: Hosted Loop interval ticks

**What to build:** After sign-in, hourly/daily/weekly Loops tick on the account server even if the desktop is closed. The renderer stops ticking. Reminders stay an Inbox folder.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [ ] Signed-in interval Loops run on the account server; a signed-in renderer does not call `tick`
- [ ] Signed-out Loops still tick only while the app is open
- [ ] One run per Loop per interval period (`{loopId, periodStart}`); a failed interval run retries after five minutes
- [ ] Event-triggered Loops do not re-run the same Issue activity (`{loopId, issueId, activityId}`)
- [ ] Assign, raise-priority, and summarize Loops run without a Confirmation
- [ ] Slack Loop actions stay `limited`; `limited` means the adapter is not connected, not “waiting for confirm”
- [ ] Reminders remain Inbox snooze; no due-date job mutates Issues; desktop OS toast only while the desktop process is alive

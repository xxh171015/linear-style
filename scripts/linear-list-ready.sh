#!/usr/bin/env bash
# LIST_TASKS_COMMAND for Sandcastle custom tracker.
# Prints JSON array of XXH issues labelled ready-for-agent.
# Include triage: Linear defaults new issues (and /to-tickets children) to
# Triage even after ready-for-agent is applied. Done/Canceled stay excluded.
set -euo pipefail
LINEAR_BIN="${LINEAR_BIN:-linear}"
if ! command -v "$LINEAR_BIN" >/dev/null 2>&1; then
  LINEAR_BIN="npx --yes @schpet/linear-cli"
fi
TEAM="${LINEAR_TEAM_ID:-XXH}"
$LINEAR_BIN issue query --team "$TEAM" --label ready-for-agent \
  --state triage --state unstarted --state started --state backlog \
  --json --limit all --no-input \
  | jq '[.[] | {
      id: .identifier,
      number: .identifier,
      title: .title,
      body: (.description // ""),
      labels: [(.labels // [])[] | .name // .]
    }]'

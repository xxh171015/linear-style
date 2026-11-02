#!/usr/bin/env bash
# VIEW_TASK_COMMAND for Sandcastle — usage: linear-view.sh <ID>
set -euo pipefail
ID="${1:?issue id required, e.g. XXH-11}"
LINEAR_BIN="${LINEAR_BIN:-linear}"
if ! command -v "$LINEAR_BIN" >/dev/null 2>&1; then
  LINEAR_BIN="npx --yes @schpet/linear-cli"
fi
$LINEAR_BIN issue view "$ID" --json --no-input

#!/usr/bin/env bash
# CLOSE_TASK_COMMAND for Sandcastle — usage: linear-close.sh <ID>
set -euo pipefail
ID="${1:?issue id required, e.g. XXH-11}"
LINEAR_BIN="${LINEAR_BIN:-linear}"
if ! command -v "$LINEAR_BIN" >/dev/null 2>&1; then
  LINEAR_BIN="npx --yes @schpet/linear-cli"
fi
$LINEAR_BIN issue comment add "$ID" --body "Completed by Sandcastle" --no-input --yes
$LINEAR_BIN issue update "$ID" --state Done --no-input

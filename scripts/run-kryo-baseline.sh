#!/usr/bin/env bash
set -euo pipefail

PHASE="${1:-}"
TASK="${2:-}"
APPROVAL="${3:-}"

case "$PHASE" in
  review|deploy|rollback) ;;
  *) echo '{"status":"BOOTSTRAP_FAILED","reason":"phase must be review, deploy or rollback"}'; exit 2 ;;
esac

if [[ -z "$TASK" ]]; then
  echo '{"status":"BOOTSTRAP_FAILED","reason":"task filename required"}'
  exit 2
fi

if [[ "$TASK" == */* ]]; then
  TASK_PATH="$TASK"
else
  TASK_PATH="marketing/baseline-changes/$TASK"
fi

if [[ "$TASK_PATH" != marketing/baseline-changes/*.json ]]; then
  echo '{"status":"BOOTSTRAP_FAILED","reason":"task must be a JSON file under marketing/baseline-changes"}'
  exit 2
fi

# Refresh only remote refs. Never alter the user's worktree/index/stash.
git fetch --quiet origin main

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git show origin/main:scripts/kryo-baseline-change.mjs > "$TMP_DIR/run.mjs"
git show "origin/main:$TASK_PATH" > "$TMP_DIR/task.json"

node "$TMP_DIR/run.mjs" selftest "$TMP_DIR/task.json"

if [[ "$PHASE" == "review" ]]; then
  exec node "$TMP_DIR/run.mjs" review "$TMP_DIR/task.json"
fi

if [[ -z "$APPROVAL" ]]; then
  echo '{"status":"APPROVAL_REQUIRED","reason":"exact owner approval token required for deploy/rollback"}'
  exit 2
fi

exec node "$TMP_DIR/run.mjs" "$PHASE" "$TMP_DIR/task.json" "$APPROVAL"

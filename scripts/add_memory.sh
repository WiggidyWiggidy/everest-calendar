#!/usr/bin/env bash
# add_memory.sh — low-friction helper to add a new shared agent-memory file.
#
# Usage:
#   ./add_memory.sh <type> <slug> "<description>"
#
# Where:
#   type        ∈ {user, feedback, project, reference}
#   slug        is the filename (no .md). Convention: <type>_<topic_snake_case>
#   description is the one-line hook (used in MEMORY.md index and Supabase search)
#
# Examples:
#   ./add_memory.sh feedback codex_quirk_2026_05_18 "Codex sometimes truncates long heredocs in zsh — wrap in single quotes."
#   ./add_memory.sh project pump_supplier_decision_2026_05_18 "Picked Xitielong 24V diaphragm pump over Topsflo. Reasoning + URL + price."
#
# What it does:
#   1. Creates the file with valid frontmatter (passes the sync script's parser)
#   2. Opens $EDITOR for the body (defaults to nano if unset)
#   3. Appends a pointer line to MEMORY.md under "## Recent additions"
#   4. Runs the sync script so Supabase mirror picks it up immediately
#
# Both Claude (via auto-memory) and Codex (via shared-memory cluster pointers + Supabase RPC)
# will see the new entry on their next session start.

set -euo pipefail

MEMORY_DIR="/Users/happy/.claude/projects/-Users-happy-Desktop-Claude-Project/memory"
INDEX_FILE="$MEMORY_DIR/MEMORY.md"
SYNC_SCRIPT="/Users/happy/Desktop/Claude Project/everest-calendar/scripts/sync_agent_memory.py"
AUTO_SECTION_HEADER='## Recent additions (auto-merged by sync — please re-file when convenient)'

usage() {
  cat <<EOF
Usage: $0 <type> <slug> "<description>"
  type        in {user, feedback, project, reference}
  slug        filename without .md (e.g. feedback_codex_quirk_2026_05_18)
  description one-line hook used in MEMORY.md + Supabase search
EOF
  exit 1
}

[ $# -eq 3 ] || usage
TYPE="$1"
SLUG="$2"
DESC="$3"

case "$TYPE" in
  user|feedback|project|reference) ;;
  *) echo "ERROR: type must be one of: user, feedback, project, reference"; exit 1;;
esac

if ! echo "$SLUG" | grep -qE '^[a-z0-9_-]+$'; then
  echo "ERROR: slug must match ^[a-z0-9_-]+\$ (lowercase, alphanumeric, underscore, hyphen)"
  exit 1
fi

FILE="$MEMORY_DIR/$SLUG.md"
if [ -e "$FILE" ]; then
  echo "ERROR: $FILE already exists. Pick a different slug or edit the file directly."
  exit 1
fi

# Derive a display name from slug
NAME=$(echo "$SLUG" | tr '_-' '  ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)} 1')

# Write the file with frontmatter
cat > "$FILE" <<EOF
---
name: $NAME
description: $DESC
type: $TYPE
---

# $NAME

<!-- Write the body below this comment. Save and quit to continue.
     Body should answer one of:
     - The rule / fact / observation (1-2 lines)
     - **Why:** the reason (so future-you can judge edge cases)
     - **How to apply:** when/where this kicks in
     Keep under ~150 lines. Be specific. -->


EOF

# Open editor
EDITOR_CMD="${EDITOR:-nano}"
"$EDITOR_CMD" "$FILE"

# Bail if user wrote nothing
if ! grep -qv '^<!--\|^---\|^name:\|^description:\|^type:\|^# \|^$' "$FILE"; then
  echo ""
  read -p "File appears empty. Discard and exit? [y/N] " confirm
  if [ "${confirm:-N}" = "y" ] || [ "${confirm:-N}" = "Y" ]; then
    rm "$FILE"
    echo "Discarded."
    exit 0
  fi
fi

# Append pointer line to MEMORY.md
POINTER="- [$NAME]($SLUG.md) — $DESC"

if grep -qF "$AUTO_SECTION_HEADER" "$INDEX_FILE"; then
  awk -v hdr="$AUTO_SECTION_HEADER" -v ptr="$POINTER" '
    BEGIN { in_section = 0; appended = 0 }
    {
      if (!appended && in_section && /^## /) { print ptr; appended = 1; in_section = 0 }
      print
      if ($0 == hdr) { in_section = 1 }
    }
    END { if (in_section && !appended) print ptr }
  ' "$INDEX_FILE" > "$INDEX_FILE.tmp" && mv "$INDEX_FILE.tmp" "$INDEX_FILE"
else
  printf "\n%s\n%s\n" "$AUTO_SECTION_HEADER" "$POINTER" >> "$INDEX_FILE"
fi

echo ""
echo "Wrote $FILE"
echo "Indexed in MEMORY.md"

echo ""
echo "Syncing to Supabase mirror..."
python3 "$SYNC_SCRIPT" 2>&1 | tail -4

echo ""
echo "Done. Both Claude (next session auto-load) and Codex (next session memory-cluster lookup) will see this entry."
echo "Re-file MEMORY.md entry to the appropriate section when you have a moment (it is currently under 'Recent additions')."

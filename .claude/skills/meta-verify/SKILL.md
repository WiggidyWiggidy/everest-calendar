---
name: meta-verify
description: Verify the Meta MCP connection, account mapping, reporting timezone, core metrics, and safety configuration using a tiny read-only query.
disable-model-invocation: true
context: fork
background: false
effort: medium
allowed-tools: Read Write Edit Glob Grep
---

# Verify Meta MCP

Read `account-context.md`, `tool-map.md`, `metric-dictionary.md`, and `query-policy.md` from `${CLAUDE_PROJECT_DIR}/.claude/meta/`.

Use confirmed read-only tools only. Make at most 2 MCP calls.

1. Query one recent complete day for the configured account at campaign level, limited to active/spending campaigns and no more than 10 rows.
2. Request only: campaign ID/name, spend, impressions, link/outbound clicks if supported, purchases and purchase value if supported.
3. Validate:
   - correct account, currency and timezone,
   - values parse as expected,
   - purchase/action extraction paths in `tool-map.md`,
   - no accidental all-click CTR substitution,
   - no write tool is allowlisted in `.claude/settings.local.json`.
4. If a mapping is wrong, update `tool-map.md`; do not silently reinterpret it.
5. Return a compact PASS / PARTIAL / FAIL checklist and the exact issue to fix. Do not perform a full audit.

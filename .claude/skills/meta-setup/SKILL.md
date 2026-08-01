---
name: meta-setup
description: Discover and map the connected Meta Ads MCP server once, identify read versus mutation tools, configure account context, and create a safe local permission proposal.
disable-model-invocation: true
context: fork
background: false
effort: high
allowed-tools: Read Write Edit Glob Grep
---

# Meta MCP one-time setup

Set up the connected Meta Ads MCP without making any live advertising changes.

Read:
- `${CLAUDE_PROJECT_DIR}/.claude/meta/account-context.md`
- `${CLAUDE_PROJECT_DIR}/.claude/meta/tool-map.template.md`
- `${CLAUDE_PROJECT_DIR}/.claude/meta/query-policy.md`

## Constraints

- Never call any tool that can mutate Meta objects.
- Use no more than 5 MCP calls.
- Do not list all accounts if an account ID is already configured.
- Use the smallest harmless query needed to test access.
- Never expose or store tokens.

## Procedure

1. Inspect the MCP tools available in your tool context. Identify the exact server prefix and every tool whose schema clearly indicates Meta Ads functionality.
2. Classify each relevant tool as:
   - confirmed read-only,
   - confirmed mutation,
   - ambiguous/keep behind approval.
   Classification must come from the tool name and schema, not intuition.
3. Resolve the intended ad account. Prefer the configured account ID. If missing, use a minimal account-list/read call and select the account matching the business context; do not enumerate unrelated detail.
4. Make one tiny read-only test query for a recent complete day at account or campaign level with only spend and impressions, plus names/IDs if required.
5. Retrieve only the small amount of account metadata required to establish currency, timezone and attribution/reporting behaviour, when supported.
6. Write `.claude/meta/tool-map.md` using the template. Include exact canonical MCP names and input fields.
7. Update only still-missing factual fields in `account-context.md`. Leave commercial economics marked `REQUIRED` when Meta cannot establish them.
8. Create `.claude/settings.local.json` with:
   - `allow` entries only for tools proven read-only,
   - `ask` entries for mutation or ambiguous tools.
   Do not use a broad `mcp__server__*` allow rule.
9. Report the setup result in under 250 words: account selected, tools mapped, read test result, missing required business inputs, and the exact commands `/status`, `/permissions`, then `/meta-verify`.

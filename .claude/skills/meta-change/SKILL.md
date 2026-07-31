---
name: meta-change
description: Make an explicitly requested live Meta Ads change with read-before-write verification, an exact preview, smallest possible mutation, post-change verification and rollback record.
disable-model-invocation: true
context: fork
background: false
effort: high
allowed-tools: Read Write Edit Glob Grep
---

# Guarded Meta Ads change

Requested change: `$ARGUMENTS`

Read `account-context.md`, `tool-map.md`, `analysis-rules.md`, and `change-log.md`.

## Non-negotiable procedure

1. Resolve the exact account and object ID. Never rely only on a similar name.
2. Use a confirmed read tool to retrieve the object's current value/status and enough parent context to avoid changing the wrong object.
3. Validate that the requested change is unambiguous and within the user's stated instruction. Do not bundle extra optimisation.
4. Before calling a mutation tool, show a compact preview:
   - account,
   - object ID/name/type,
   - exact before value,
   - exact after value,
   - expected effect,
   - risk,
   - rollback.
5. The MCP permission prompt/hook is the final human approval. Do not evade or auto-approve it.
6. Make one smallest possible mutation using a confirmed mutation tool.
7. Immediately read the object again and verify the intended state.
8. Append the completed change to `.claude/meta/change-log.md` with account-timezone timestamp and rollback.
9. If verification fails or the tool response is ambiguous, state that clearly and do not retry a different mutation unless the user instructs it.

Never create, publish or activate additional objects merely to complete a partial request. Never change budgets or status based on an analysis skill alone.

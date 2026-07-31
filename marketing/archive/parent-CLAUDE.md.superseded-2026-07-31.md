# ATLAS -- Everest Labs Orchestration System

## Session Start

Run this before doing anything else:

```bash
curl -s -X POST "$EVEREST_SUPABASE_URL/rest/v1/rpc/session_warmup" \
  -H "apikey: $EVEREST_SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $EVEREST_SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" -d "{}"
```

Returns: `health` (invariants), `inbox` (pending + ready to send counts), `last_handoff` (previous session summary).

Respond: **"Ready. Health [pass/fail] | [N] pending | [N] ready to send"**

If health fails: fix invariants FIRST. If last_handoff exists: read it.

## Session End (MANDATORY)

1. Run `check_invariants()` -- verify nothing broke
2. Write handoff to `openclaw_memory`:
```bash
curl -s -X POST "$EVEREST_SUPABASE_URL/rest/v1/openclaw_memory" \
  -H "apikey: $EVEREST_SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $EVEREST_SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"date":"'$(date +%Y-%m-%d)'","category":"handoff","content":"SESSION: [what was done / decided / left pending]","source":"claude"}'
```

## Voice

Short sentences. No filler. State actions, not possibilities. Lead with what changed. No emoji headers, no template blocks, no "Let me know if you need anything else."

## Decision Tiers

- **Tier 0 (just do it)**: Internal logging, status queries, drafting, pipeline updates
- **Tier 1 (draft + Tom approves)**: External messages, task assignments, follow-ups
- **Tier 2 (Tom writes)**: Factory negotiations, financial commitments, pricing

## Interface

Web dashboard at `everest-calendar.vercel.app`. Telegram is deprecated (passive notifications only).

**Supabase REST API:** Base URL `$EVEREST_SUPABASE_URL/rest/v1/`, headers use `$EVEREST_SUPABASE_SERVICE_KEY`.

Key RPCs: `session_warmup`, `get_pending_inbox`, `get_contact_briefing`, `get_conversation_thread`, `log_supplier_message`, `get_supplier_comparison`, `check_invariants`

## Two Systems -- Do Not Confuse

| System | What it is |
|--------|-----------|
| **This system** (everest-calendar) | Claude Code + Codex CLI + Supabase + web dashboard |
| **OpenClaw** (legacy) | Local Node.js gateway for personal WhatsApp |

They share the same Supabase DB and OpenRouter key. Do NOT edit `~/.openclaw/` files.

### Shared memory with Codex CLI (since 2026-05-18)

Codex reads + writes your auto-memory at `~/.claude/projects/-Users-happy-Desktop-Claude-Project/memory/` per its global AGENTS.md. Both tools use the same filesystem path, so new memory files either tool creates are seen by the other on next session start. A Supabase mirror lives at table `agent_memory` (RPCs `get_agent_memory(domain)` + `list_agent_memory()`) — refresh via `python3 everest-calendar/scripts/sync_agent_memory.py`. Treat the filesystem as source of truth.

If you notice a memory entry written by codex (frontmatter type=feedback/project/etc with no `created_by_tool=claude` history), respect it the same as your own — both tools' learnings build the shared knowledge base.

## Cost Rule

ALL LLM calls route through Max plan OAuth. Never use Anthropic API keys or OpenRouter for new automation.

## Rules

See `everest-calendar/CLAUDE.md` for: verification rules, CAD safety, guardrails, contact rules, code rules, status value constraints.

For anything touching Meta ads / landing pages / `/api/marketing/*` routes, read [everest-calendar/MARKETING_RUNBOOK.md](everest-calendar/MARKETING_RUNBOOK.md) first — tool-neutral spec covering route shapes, auth, state tables, inbox conventions, QC dimensions. Reference implementations at `~/.claude/commands/clone-{ad,product}.md` and `~/.claude/commands/launch-{angle,kryo}.md`.

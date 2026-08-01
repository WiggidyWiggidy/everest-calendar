#!/usr/bin/env python3
"""Claude Code PreToolUse guard for Meta-like MCP tools.

It does not approve calls. It only forces confirmation for likely mutations or
suspiciously broad reporting calls. Normal Claude Code permissions still apply.
"""

from __future__ import annotations

import json
import re
import sys
from typing import Any


def decision(kind: str, reason: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": kind,
                    "permissionDecisionReason": reason,
                }
            }
        )
    )


def flatten(value: Any) -> str:
    try:
        return json.dumps(value, sort_keys=True, default=str).lower()
    except Exception:
        return str(value).lower()


def has_date_scope(payload: str) -> bool:
    keys = (
        "time_range",
        "date_range",
        "date_preset",
        "since",
        "until",
        "start_date",
        "end_date",
        "last_7d",
        "last_14d",
        "last_30d",
        "yesterday",
        "today",
    )
    return any(key in payload for key in keys)


def main() -> int:
    try:
        event = json.load(sys.stdin)
    except Exception:
        # Fail safely into the normal permission flow rather than blocking work.
        return 0

    tool_name = str(event.get("tool_name", "")).lower()
    tool_input = event.get("tool_input", {})
    payload = flatten(tool_input)
    combined = f"{tool_name} {payload}"

    # Restrict this guard to Meta/Facebook/ads-named MCP servers/tools.
    if not tool_name.startswith("mcp__") or not re.search(
        r"(meta|facebook|marketing[_-]?api|ads)", tool_name
    ):
        return 0

    mutation_name = re.search(
        r"(?:^|__|_)(create|update|edit|delete|remove|archive|duplicate|publish|pause|activate|enable|disable|set|mutate)(?:_|$)",
        tool_name,
    )
    mutation_payload = any(
        re.search(pattern, payload)
        for pattern in (
            r'"(?:new_)?status"\s*:\s*"(?:active|paused|archived|deleted)"',
            r'"(?:new_)?(?:daily_budget|lifetime_budget|bid_amount)"\s*:\s*[0-9]',
            r'"(?:new_)?bid_strategy"\s*:\s*"',
            r'"(?:is_active|enabled)"\s*:\s*(?:true|false)',
        )
    )
    if mutation_name or mutation_payload:
        decision(
            "ask",
            "This Meta MCP call appears able to change live advertising objects. Review the exact object, before/after values and rollback before approving.",
        )
        return 0

    report_terms = ("insight", "report", "performance", "analytics", "metric")
    if any(term in tool_name for term in report_terms) and not has_date_scope(payload):
        decision(
            "ask",
            "This reporting call has no obvious date scope and may retrieve excessive data. Approve only if an unbounded query is genuinely required.",
        )
        return 0

    broad_terms = ("all_accounts", "all_campaigns", "all_ads", "fetch_all", "get_all")
    if any(term in combined for term in broad_terms):
        decision(
            "ask",
            "This Meta MCP call appears broad. Confirm that filters, fields and limits are narrow enough for the question.",
        )
        return 0

    # Emit nothing: continue through the normal permission flow.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

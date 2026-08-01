# Supplier runbook — Everest Labs comms, negotiation, sourcing

Tool-neutral spec. Both Claude Code and Codex CLI follow this for any supplier-facing work: messaging Alibaba/1688 suppliers, drafting negotiation replies, sourcing new components, dispatching approved messages via MCPs, hiring on Upwork.

Distills 12 supplier-tagged memory files into one loadable document. **When this runbook conflicts with the underlying memory files, the memory files win.**

---

## 1. Three protocols (loaded from Supabase `product_context` before ANY manufacturer message)

```bash
cd "/Users/happy/Desktop/Claude Project/everest-calendar"; set -a; source .env.local; set +a
for ck in negotiation_playbook chinese_comms_protocol ip_protection_protocol; do
  curl -s "$EVEREST_SUPABASE_URL/rest/v1/product_context?context_key=eq.$ck&select=content" \
    -H "apikey: $EVEREST_SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $EVEREST_SUPABASE_SERVICE_KEY" \
    | python3 -c "import json,sys; r=json.load(sys.stdin); print(f'=== {\"'$ck'\"} ===\\n{r[0][\"content\"] if r else \"NOT FOUND\"}')"
done
```

1. **`negotiation_playbook`** — phase map (intro → discovery → quote → close), response decoder (what supplier replies actually mean), leverage points, counter-offer templates.
2. **`chinese_comms_protocol`** — cultural intelligence (face-saving, indirectness, hierarchy), message architecture, tone calibration, trust scoring, learning loop.
3. **`ip_protection_protocol`** — information tiers (what's safe to share at intro vs discovery vs quote), cover story, red flags, factory visit rules, legal protections.

Load all three. Cite which protocol drove each decision in the draft.

---

## 2. Hard rules

### 2.1 No supplier name without a verified URL
Every time you name a supplier, factory, shop, or vendor to Tom: include EITHER a direct purchase/listing URL (1688 offer page, Alibaba product page, supplier's own site), OR a clear citation of where the name came from (agent report with URL, Supabase query result, web search result with URL). **No exceptions.** "I found some good shops" without URLs is noise to Tom. Source: `feedback_supplier_link_mandatory.md`.

### 2.2 Tom is in Guangzhou
Tom's location is **Guangzhou, China** — not Dubai. Dubai is the end-customer market. Don't propose Tom "visit the Dubai showroom" or assume he can't fly to a Shenzhen factory. Source: `feedback_tom_location_guangzhou.md` + `feedback_tom_location_hallucination.md`.

### 2.3 Currency default
Supplier dollar figures = **USD** by default. AUD only if explicit. RMB only if the supplier quoted in RMB. Source: `feedback_supplier_currency_default.md`.

### 2.4 No em dashes in outbound messages
Tom's hard rule — em dashes leak "AI generated" tone. Use periods, semicolons, or sentence rewrites. Source: `feedback_no_em_dash.md`.

### 2.5 Alibaba is copy-paste, not Chrome MCP
Chrome MCP times out on Alibaba's chat UI. Do NOT attempt it. Tom approves via the dashboard's "Ready to Send" tab, copies the message, pastes into Alibaba chat, clicks "Sent". Goal: move every supplier to WhatsApp where full MCP automation works. Source: project CLAUDE.md guardrail 1 + `feedback_alibaba_chrome_deprecated.md`.

### 2.6 Every first-contact message includes the WhatsApp pivot
"For faster communication, feel free to reach me on WhatsApp: +86 13002019335" — append to every first-contact Alibaba message so we can migrate the conversation off the platform. Source: project CLAUDE.md guardrail 1.

### 2.7 1688 search format
Search terms for 1688 in single-line code blocks. One block = one copy click. Tom copies them into 1688 search bar one at a time. Source: `feedback_1688_search_format.md`.

---

## 3. Contact-specific rules (per-person playbooks)

| Contact | Tier | Rules |
|---|---|---|
| **Imran (Everest Labs HQ)** | 1 | Max 3 actions/message. Single deliverable. "OK/Noted" = ask for the actual file. Silence >24h = stuck. |
| **Jay / Alpicool** | 2 | **Tom writes pricing himself.** Formal technical language. mm only, never inches. Never discuss pricing in measurement requests. |
| **Alper** | 1 | Sprint-based at $21.90/hr. Upwork only. Sprint structure is cost compression, not surveillance (frame as "keeps us both aligned"). |
| **Steven, Ally, Stella, Demi, Jack** | 1 | Standard Alibaba supplier flow. Draft, Tom approves, copy-paste to Alibaba, append WhatsApp pivot. |
| **All Alibaba suppliers** | 1 | Always include product identifiers. Use the phrase "Gathering quotes — no commitment." Never agree to prices in chat — only Tom does. |

Source: project CLAUDE.md Contact Rules section + `feedback_chinese_comms.md` (Tom's corrections to drafts — load before any manufacturer message).

---

## 4. Tracking conventions

```sql
-- Before drafting any new message:
SELECT * FROM get_conversation_thread('<supplier_key>');

-- After Tom approves + sends:
SELECT log_supplier_message('<supplier_key>', '<channel>', '<message>', '<direction>');
```

Supplier keys: `steven`, `ally`, `stella`, `demi`, `jack`, `jay`. New suppliers get added to `communication_protocols` first (with trust score baseline + per-contact rules).

---

## 5. The MCP comms routing layer

**Status (as of 2026-04-21 — verify with `~/.claude/projects/.../memory/project_mcp_comms_routing.md` for current state):**

| Channel | MCP | Status | Notes |
|---|---|---|---|
| **WeChat** | wechat-mcp-venv (Accessibility API) | ✓ Connected | Tools `mcp__wechat__*` available |
| **WhatsApp** | Green API via launchd bridge | Needs QR scan periodically | Open http://localhost:8080/api/qr → scan with phone → restart Claude Code. Bridge: `~/whatsapp-mcp/whatsapp-bridge`, launchd `com.everest.whatsapp-bridge` |
| **Alibaba** | (none — copy-paste only) | n/a | Tom's manual paste from dashboard |
| **Upwork** | Chrome MCP | n/a | DM via browser; manual + Tom-driven |
| **Telegram** | telegram plugin (Claude + Codex) | ✓ Connected | Passive notifications only — DEPRECATED for sending |

**Sonnet workflow for MCP sends (Claude Code only — codex doesn't have WhatsApp/WeChat MCPs):**

When Tom says "send the approved comms":
1. Query `message_drafts` (or `platform_inbox` if it's a manual message) for the next `status='approved'` row with a WhatsApp or WeChat target.
2. Build the platform-specific call (e.g. `mcp__whatsapp__send_message(to=<phone>, body=<text>)`).
3. After send: `UPDATE message_drafts SET status='sent', sent_at=now() WHERE id=<id>;`.
4. Call `log_supplier_message()` to update the conversation thread.

**Codex limitation:** Codex doesn't have WhatsApp/WeChat MCPs configured (they're bound to Tom's personal phone). Codex CAN draft messages + write them to `message_drafts` with `status='pending_review'` — Claude (or Tom manually) does the actual send.

---

## 6. Alpicool — BATNA reference (load before any Alpicool negotiation)

**"MOQ 100 for P22" is a negotiation tactic, NOT a tooling constraint.** Same factory's G22 (P22 minus wheels/battery) lists at MOQ 2 on Alibaba. Alpicool exports $72.9M/yr — 10 units is noise. Source: `project_alpicool_moq_alternatives.md` for the full BATNA list (3 verified alternative suppliers with link + capacity).

**P22 inner liner is NOT watertight** — multi-panel, PU-foam bonded, food-fridge cavity. KRYO needs a drop-in inner vessel. Standing 22L of water inside the bare cabinet will wick through seams, destroy insulation, cascade into compressor overwork + corrosion within weeks. Source: `project_p22_liner_not_watertight.md`.

---

## 7. Upwork / freelancer pipeline (when sourcing labor instead of components)

Hiring rules — cap $40 USD/hr, flag over for negotiation (do NOT auto-reject). Files in STEP/STP. Tier candidates (Top / Maybe / Reject). Confidentiality: never reveal the product type during evaluation — use "cooling unit product" wording. Source: `project_upwork_pipeline.md`.

Sprint structure (live session model): saves 30-50% vs async by eliminating revision round-trips. Frame to candidate as "keeps us both aligned" — clear deliverables for them, visibility for us. Get their hour estimate FIRST as the benchmark. Define midway checkpoint at 50%. Source: `project_freelancer_playbook.md`.

---

## 8. New-supplier sourcing flow (the `/source-supplier` skill)

End-to-end pipeline: research → validate → DB write → bilingual outreach → QC → Chrome MCP dispatch. Usage `/source-supplier <category> [--spec <ref>] [--location <city>] [--moq <n>] [--volume "<tiers>"] [--max-shortlist <n>]`. Categories: `aluminum_shell`, `greyboard_mockup`, `psu`, `pump`, `connectors`, `cables`, `packaging`.

Skill lives at `~/.claude/skills/source-supplier/` (Claude only — codex equivalent NOT yet ported because the dispatch leg depends on Chrome MCP for Alibaba which is Tom-account-bound).

If codex needs to do sourcing: do the research + validate + DB-write legs only. Hand the outreach + dispatch back to Claude.

---

## 9. Session protocol (supplier work specifically)

**Start:** Query the contact's `communication_protocols` row to load their trust score + per-contact rules. Run `get_contact_briefing(<supplier_key>)` for the conversation context.
**Draft:** Apply all three protocols + contact rules + Tom's correction history (`feedback_chinese_comms.md`).
**Before showing Tom:** Run the IP-protection checklist — is this message safe to send at this conversation phase? Anything in the message that violates the information tier? If yes, redact.
**After Tom approves:** Either dispatch via MCP (WhatsApp/WeChat) OR queue for copy-paste (Alibaba) OR Tom-drives (Jay/Tier 2).
**End:** Call `log_supplier_message()` to update the thread. Update `communication_protocols.trust_score` if anything changed. Sync agent_memory.

---

## 10. Out of scope

- Pricing decisions on commitments >$50 — **Tier 2, Tom writes himself**
- Anything touching Jay/Alpicool pricing — Tier 2
- Editing `communication_protocols.trust_score` for protected contacts without explicit Tom approval
- Auto-sending messages without Tom's approval (Tier 1 minimum for all external comms)
- Anything in `~/.openclaw/` — that's the legacy WhatsApp gateway, do not edit

# KRYO product runbook — UX, electrical, thermal, shower head, cold-exposure science

Tool-neutral spec. Both Claude Code and Codex CLI follow this for any KRYO product engineering, UX, electrical, or thermal work.

Distills the KRYO-tagged memory files (excluding marketing — that's in `MARKETING_RUNBOOK.md`, and CAD shell mechanics — that's in `CAD_RUNBOOK.md`).

**When this runbook conflicts with the underlying memory files, the memory files win.**

---

## 1. The product (one-paragraph summary)

KRYO is a **semi-permanent Dubai-bathroom cold-plunge appliance**. One-time 3-min setup. Not moved daily. Off-the-shelf Alpicool P22 cold-fridge cabinet (modified into water vessel) + 360W PSU + diaphragm pump + dual shower head (rain + handheld) + cryo-engine cabinet aesthetic.

Target customer: affluent Dubai professional in luxury high-rise apartment. AED 3,990 ($1,087). Tap water is warm year-round; KRYO delivers a 30-second 1°C shower. Cares about look, ease, quiet, consistent temperature. Does NOT care about wire gauge or PSU efficiency curves.

Source: `project_kryo_ux_solution.md`.

---

## 2. Hard architectural constraints (changing any of these invalidates downstream work)

### 2.1 Dubai power
Dubai bathrooms have NO standard 13A outlets (BS 7671 prohibits within 3m of shower/bath). Shaver outlets are 20-50VA — **not viable** for KRYO's 120W peak. The architectural answer: PSU sits in the **bedroom**, 5m flat cable runs through the wall to the bathroom-side panel jack. Source: `project_kryo_ux_solution.md`.

### 2.2 P22 inner liner is NOT watertight
Alpicool P22 cabinet liner is multi-panel (vertical seam + horizontal trim joint), bonded externally by PU foam. Engineered as a food-fridge cavity, NOT as a water vessel. Standing 22L of water inside will wick through seams into the foam → insulation R-value destroyed → compressor overwork → electrical corrosion → compressor-vent weep. Weeks-to-months timeline, accelerating.

**KRYO requires a drop-in inner vessel.** Source: `project_p22_liner_not_watertight.md` (physical test 24 Apr 2026).

### 2.3 Compressor control topology — W1308 + 30A relay
HOG-18 24VDC fridge unit is the chiller. Switching is **XH-W1308 (24V variant)** thermostat → **external 30A automotive relay** → compressor (NOT W1308 switching the compressor directly — it would burn out).

**W1308 settings (non-negotiable):**
- `P0 = C` (cooling mode)
- `P1 = 1.0` (deadband)
- `P5 = 3` (compressor restart delay in minutes — protects compressor from short-cycling)

Source: `project_kryo_thermostat_architecture.md` (validated 2026-05-08 by Kimi sign-off + factory-defect failure analysis).

### 2.4 Shower head — committed architecture
**Both heads always run simultaneously.** No diverter, no thermostatic, no LED. Single cold inlet from KRYO pump via brass Y-tee. Asymmetric flow split via **intrinsic orifice area** — rain head has more total hole area than handheld, so flow naturally splits **68/32** (rain-heavy). Total flow target 8 LPM (5.5 rain + 2.5 handheld).

Locked 19 Apr 2026 after 3 design iterations + full physics workup. Source: `project_kryo_shower_head.md`.

### 2.5 Wiring architecture (APPROVED 2 Apr, refined 20 Apr)
```
[360W PSU in bedroom] → [15A inline fuse PSU end] → [5m flat 16AWG cable]
→ [SP21 IP67 panel jack on bathroom side]
→ [12AWG trunk]
→ [GQ22 power switch SPST]
→ [Daier FB-1707L 4-way ATO fuse block]
   ├── C1: [5A fuse]  → 16AWG → P22 compressor (45W run, 6A peak <200ms BLDC soft-start)
   ├── C2: [10A fuse] → 14AWG → XTL W0555YD diaphragm pump
   ├── C3: [3A fuse]  → 18AWG → W1308 thermostat controller (logic only)
   └── C4: [5A fuse]  → 18AWG → 30A relay coil (compressor switching)
```
Source: `project_kryo_electrical_system.md`. (Pump selection was still OPEN as of memory write — verify current state before quoting.)

### 2.6 Service model — NO Dubai presence
**No Dubai warehouse. No Dubai tech.** Self-service product. Parts ship from China direct to customer. Changed 5 Apr 2026; this changes the whole design approach. Don't propose anything that requires on-site installation or local stocking. Source: `project_service_model_shift.md`.

---

## 3. Component placement (where each part lives in the shell)

See `CAD_RUNBOOK.md` for the placement workflow + STEP-frame discipline. Quick map (ISU-001 shell):

- **Compressor bay (P22)** — bottom-rear, mounted on shell base via factory mounts
- **PSU bay** — NOT in the shell (remote, lives in bedroom)
- **Pump** — bottom-front, oriented per `feedback_rotation_process.md` (feet toward P22, per Tom's 9 Apr correction)
- **W1308 + relay** — side compartment, accessible without disassembly
- **Fuse block (Daier FB-1707L)** — same compartment as W1308
- **SP21 panel jack** — bathroom-facing side, IP67-rated cutout
- **Dual shower head pickup** — top of unit, single pump outlet → brass Y-tee → 2 hoses

For exact XYZ, query the STEP file via `python3 /tmp/inspect_step_holes.py` (per CAD_RUNBOOK).

---

## 4. Cold-exposure science (load before any temperature/duration/health claim)

Full science compendium lives in Supabase `product_context` table:

```bash
curl -s "$EVEREST_SUPABASE_URL/rest/v1/product_context?context_key=eq.kryo_cold_exposure_research&select=content" \
  -H "apikey: $EVEREST_SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $EVEREST_SUPABASE_SERVICE_KEY"
```

Don't claim health benefits without citing this. Don't propose temperature/duration combos that contradict it. Source pointer: `project_kryo_cold_exposure_research.md`.

---

## 5. Brand voice + promo content

**For promo videos**: use the `/promo-storyboard` → `/i2v` → `/animate-image` skill chain (codex has equivalents). Brand bible lives at `~/Desktop/KRYO_brand/brand_bible.md`. Higgsfield CLI installed + authed as `everestlabs.co@gmail.com` (free plan, 10 cred/day). Telemetry table: `ai_video_runs`. Source: `project_kryo_promo_video_system.md`.

**For marketing variants**: use `MARKETING_RUNBOOK.md` (separate doc). The "Eight Sleep emulation playbook" is the canonical brand reference for tone + audience framing. Source: `project_kryo_eight_sleep_playbook.md`.

**For ad copy / claims**: load `product_context.kryo_v4_canonical` for the canonical positioning (AED 3,990, 4×AED 997.50, 1°C cryo-engine, no tub, no plumbing). Never reference EverestPod / NUE Shower / EverestEvo.

---

## 6. Current funnel state (as of 2026-05-18)

7-day spend $33.41 → 5 ATCs → 6 ICs → **0 purchases**. The bottleneck is **the Shopify checkout step**, NOT the cart drawer. Most likely cause: GBP currency mismatch + missing UAE market config. Dubai buyer profile: 35-44 male iPhone Instagram-Feed. Source: `project_kryo_checkout_diagnosis_2026-05-18.md`.

Storefront audit (14 May 2026) found 3 sitewide JS bugs (eval-packer SyntaxError, WhatsApp app misconfig, UpCart/Judge.me Liquid leaks). All deferred per Tom — Shopify Markets geo-blocks Guangzhou so chrome-devtools couldn't see `kryo-2-0` directly. Revisit when test velocity allows OR when UAE-emulated access (Apify proxy / VPN) is set up. Source: `project_storefront_bug_audit_2026_05_14.md`.

---

## 7. Hard rules for product engineering work

1. **Components must have Tier-1 inputs** before CAD/render: supplier link + part number + STEP file. Photo-derived renders have failed badly (SP21 disaster 4 May 2026). Source: `feedback_component_cad_inputs.md`.
2. **Pump protection** — diaphragm pump must have a flow switch or pressure sentinel. Dry-running kills it in minutes. Source: `project_kryo_electrical_system.md`.
3. **All physical-product deliverables go to `~/Desktop/<name>/`** and the folder gets `open`ed for Tom. Don't bury STLs in project subdirs. Source: `feedback_deliverables_to_desktop.md`.
4. **Local AI image gen is NOT viable** on Tom's Mac (M2 / 8GB RAM). Use cloud only — and specifically OpenRouter GPT-image (low quality). Don't propose FLUX/SDXL/local-stable-diffusion. Source: `feedback_tom_mac_m2_8gb.md` + `feedback_image_gen_openrouter.md`.
5. **CAD work must enter plan mode** before any geometry or dimension change. Tom approves the plan first. Source: project CLAUDE.md + CAD_RUNBOOK.md.

---

## 8. Out of scope (don't touch without explicit ask)

- `@KRYO_BUILDINGBOT` Edge Function, the 9 RPC functions, the 11 scheduled tasks (live infrastructure)
- `product_context.kryo_v4_canonical` (rewriting positioning is a marketing decision, not a product one)
- `~/.openclaw/` files (legacy WhatsApp gateway, different system)
- `everest-calendar/cad/` outside of `cad/shell/` and `cad/render/` (legacy)
- Anything in CAD without the rotation/STEP-frame discipline from `CAD_RUNBOOK.md`
- Health/medical claims not backed by `product_context.kryo_cold_exposure_research`

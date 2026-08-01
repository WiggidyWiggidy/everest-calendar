# CAD runbook — KRYO V4 shell + component placement

Tool-neutral spec. Both Claude Code and Codex CLI follow this when doing any CAD work on the KRYO V4 shell or component placement. Distills the 16 CAD-tagged memory files at `~/.claude/projects/-Users-happy-Desktop-Claude-Project/memory/feedback_cad_*.md` + `sop_kryo_v4_component_placement.md` into one loadable document.

When this runbook conflicts with anything in the underlying memory files, **the memory files win** — they're the source of truth, this is the distillation.

---

## 1. File locations (do not claim they're missing — they exist)

| Purpose | Path |
|---|---|
| **Working CAD dir (primary, git-tracked)** | `/Users/happy/Desktop/ISU001_SHELL_CAD/` |
| **Snapshot backup (frozen 2026-03-27)** | `/Users/happy/Desktop/ISU001_SHELL_CAD_SNAPSHOT_20260327_1150/` |
| **everest-calendar repo (validation only)** | `everest-calendar/cad/shell/dimensions.py` |
| **DXF exports (factory-ready)** | `~/Desktop/ISU001_SHELL_CAD/exports_final/{piece1_flat,piece2_flat}.dxf` |
| **Constants — single source of truth** | `~/Desktop/ISU001_SHELL_CAD/shell_constants.py` |
| **V4 component placement scripts** | `everest-calendar/cad/render/place_component_in_v4.py` |
| **STEP holes inspector** | `/tmp/inspect_step_holes.py` |
| **Geometric QC** | `/tmp/qc_geometric.py` |
| **Orientation truth** | `~/Desktop/ISU001_SHELL_CAD/ORIENTATION_TRUTH.md` |
| **CAD process definitive doc** | `~/Desktop/ISU001_SHELL_CAD/CAD_PROCESS.md` |

Before claiming any CAD file is missing, run `find ~/Desktop -name "<filename>"` — the dirs above sometimes contain unexpected snapshots.

---

## 2. Hard rules (violating any of these has burned hours)

### 2.1 STEP frame, not GLB frame
**ALWAYS** read cutout positions from the STEP file via `cadquery + OCCT`. NEVER from the GLB. The V4 ships as both `kryo-v4-assembled.step` (Z-up, mm) and `kryo-v4-assembled.glb` (Y-up, m). They're transformed copies of each other; the STEP is authoritative, the GLB is for visualization. **Reading positions from the GLB has caused multi-day misplacement bugs.** Source: `sop_kryo_v4_component_placement.md`.

### 2.2 Constants first
Update `shell_constants.py` BEFORE any geometry code. The constants file is the single source of truth — code reads from it, regen scripts derive from it, validation checks against it. Don't hardcode dimensions in component placement scripts. Source: `feedback_cad_constants_first.md`.

### 2.3 Dimensions must have a stated source
NEVER modify a dimension without stating one of: `factory_caliper`, `step_caliper`, `spec`, or `design`. If you can't justify the source, the change isn't ready. Source: project CLAUDE.md CAD Safety section.

### 2.4 Plan mode for ANY geometry change
Before changing geometry or dimensions, enter plan mode. Tom must approve the plan before execution. Source: project CLAUDE.md.

### 2.5 Validation gates DXF export
`validate_before_export()` blocks DXF generation if dimension validation fails. Run `python3 dimensions.py` first to get current validation state. If new failures appear after your edit, REVERT immediately — do not "fix forward". Source: project CLAUDE.md + `feedback_dxf_verification_required.md`.

### 2.6 Component placement: demand Tier-1 inputs
Before CAD/rendering an off-the-shelf component, demand ALL of: supplier link + part number + STEP file. Without all three, refuse — photo-derived renders have failed badly (4 May 2026 SP21 render had wrong cap, strap, AND barrel). Source: `feedback_component_cad_inputs.md`.

### 2.7 Rebuild + visual verify after every position change
After ANY position edit: re-run the placement script, regenerate the renders, visually verify in the browser viewer. Don't trust the math alone. Source: `feedback_cad_self_check.md`.

---

## 3. Repeatable workflow — component placement into V4 shell

```
1. Build component in CadQuery
   → exports STL parts to cad/render/assets/parts/

2. Inspect STEP cutouts (get target XYZ in STEP-frame)
   python3 /tmp/inspect_step_holes.py
   → prints cutout positions; pick the one your component slots into

3. Add COMPONENTS entry to placement script
   Edit: everest-calendar/cad/render/place_component_in_v4.py
   Add: COMPONENTS["<name>"] = { stl_path, target_xyz, rotation_deg, ... }

4. Place + render
   python3 cad/render/place_component_in_v4.py <name>
   → writes assembled STL + GLB + SVG views to cad/render/out/

5. Geometric QC (all 4 checks must PASS)
   python3 /tmp/qc_geometric.py
   → checks: inside-shell, no-collision, hole-alignment, clearance

6. Visual QC
   Open the SVG views or GLB in browser viewer.
   If anything looks off: REVERT, don't fix forward.

7. Deliver
   Move STL to ~/Desktop/KRYO_V4_assembly/ (per Tom's deliverables-to-Desktop rule)
   Open the folder so Tom can drag into Studio/print software immediately.
```

---

## 4. The rotation process (5 steps, proven 9 Apr 2026)

When Tom says "rotate the pump 90° clockwise from the top view":

1. **Identify current state from Tom's screenshot** — don't guess. Find which axis the component is currently facing.
2. **Identify desired state in Tom's words** — map "toward P22" or "feet up" to a specific +/-axis using `ORIENTATION_TRUTH.md`.
3. **Calculate the rotation mathematically** — write out the rotation matrix or the explicit (Rx, Ry, Rz) tuple. Don't intuit.
4. **Apply** — edit the placement script's `rotation_deg` for that component.
5. **Test + verify** — rebuild, render, look at the SVG views, confirm with Tom's reference frame.

Source: `feedback_rotation_process.md`. Tom's screenshot was correct after the 4th attempt only when he followed all 5 steps; the first 3 attempts skipped step 1 or step 3.

---

## 5. SVG view rotation table (per-view, baked into the rendering pipeline)

When generating SVG views, each view has its own canvas-rotation correction. Source: `feedback_svg_orientation_truth.md` — read that file before touching ANY SVG-rendering code; the per-view degrees + the explanation are too long to inline here.

---

## 6. Session protocol (CAD work specifically)

**Start:** `python3 dimensions.py` → record current validation state.
**Before each edit:** state your hypothesis in one sentence + what could break.
**One change at a time:** never bundle multiple dimension changes in one commit.
**After each edit:** re-run `dimensions.py`. If new failures, REVERT.
**End:** if dimensions or geometry changed, regenerate DXFs via the validated export path. Log to `openclaw_memory` what changed + why. Sync agent_memory: `python3 everest-calendar/scripts/sync_agent_memory.py`.

---

## 7. Failure registry (read once before any CAD session)

Skim `feedback_known_failure_modes.md` + `feedback_cad_no_guessing.md` once per CAD session. The shortlist:

- Don't guess dimensions — the validation hook will catch it but you'll have already burned hours
- Don't trust the GLB for any measurement — always go to the STEP via cadquery
- Don't assume a component fits without running `qc_geometric.py`
- Don't render an off-the-shelf component from photos — demand the STEP from the supplier
- Don't "fix forward" after validation fails — revert and diagnose

---

## 8. Out of scope

- 2D engineering drawings (handled by the CAD package directly, not by this pipeline)
- Manufacturing tolerances (set in `shell_constants.py`, don't override per-component)
- Renders for marketing (use `/animate-image` or `/i2v` skills — those operate on PNGs, not STEP files)
- Anything in `everest-calendar/cad/` that's NOT under `cad/shell/` or `cad/render/` (legacy, do not touch)

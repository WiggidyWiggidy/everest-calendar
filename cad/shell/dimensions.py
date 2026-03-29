"""
ISU-001 Shell Dimensions — Single Source of Truth
==================================================
All dimensions are sourced from the Supabase shell_design_revisions table (v1.0).
DO NOT hardcode values. Every number here must trace back to a source:
  - factory_caliper: measured from physical P22 unit
  - step_caliper: measured from Imran's STEP file
  - supplier_quote: from factory communication
  - design: engineering decision (documented why)
  - spec: from component datasheet

To add/modify a dimension:
  1. Enter plan mode
  2. State the current value + source
  3. State the new value + source + why
  4. Update this file AND the Supabase table
  5. Run validate_clearances() to confirm nothing broke
"""

# ── Shell Envelope ────────────────────────────────────────────────────────────
SHELL_LENGTH_MM = 580.0      # source: supplier_quote
SHELL_WIDTH_MM = 402.0       # source: supplier_quote
SHELL_HEIGHT_MM = 500.0      # source: supplier_quote

# ── Material ──────────────────────────────────────────────────────────────────
SHEET_THICKNESS_MM = 1.5     # 5052-H32 aluminium
BEND_RADIUS_MM = 3.0         # inner bend radius (1.5-2x thickness)
K_FACTOR = 0.44              # bend calculation factor

# ── P22 Cooling Unit (all verified from STEP/caliper) ─────────────────────────
P22_LENGTH_MM = 442.0        # X axis — step_caliper
P22_WIDTH_MM = 372.0         # Y axis — step_caliper
P22_HEIGHT_MM = 485.0        # Z axis — step_caliper
P22_LOWER_H_MM = 168.239     # base to lower/upper boundary — factory_caliper + STEP Z=168.239mm
P22_UPPER_H_MM = 316.761     # lower/upper boundary to top (485 - 168.239)
P22_LOWER_FRONT_FLAT_W_MM = 413.984  # factory_caliper

# ── Display Cutout ────────────────────────────────────────────────────────────
DISPLAY_W_MM = 130.064       # step_caliper
DISPLAY_H_MM = 41.0645       # factory_caliper
DISPLAY_LEFT_OFFSET_MM = 45.488    # from P22 left edge — derived: 110.52 - 65.032
DISPLAY_BOTTOM_OFFSET_MM = 120.6   # from P22 bottom — step_extraction

# ── Corner Radii ──────────────────────────────────────────────────────────────
CORNER_RADIUS_LOWER_MM = 14.0   # step_caliper — confirmed R14, not R30
CORNER_RADIUS_UPPER_MM = 30.0   # step_caliper

# ── Vent Zones ────────────────────────────────────────────────────────────────
BACK_VENT_H_MM = 102.5       # step_caliper
BACK_VENT_W_MM = 187.625     # step_caliper — P22 measurement
BACK_VENT_RIGHT_OFFSET_MM = 96.838  # step_caliper
BACK_VENT_BOTTOM_OFFSET_MM = 25.0   # design

FRONT_VENT_H_MM = 60.0       # design
FRONT_VENT_W_MM = 100.0      # design
FRONT_VENT_X_OFFSET_MM = 300.0     # from left edge — design
FRONT_VENT_Y_OFFSET_MM = 50.0     # from bottom — design

SIDE_VENT_H_MM = 70.0        # design
SIDE_VENT_W_MM = 120.0       # design
SIDE_VENT_Y_OFFSET_MM = 40.0      # from bottom edge — design

BOTTOM_VENT_H_MM = 140.0     # design
BOTTOM_VENT_W_MM = 180.0     # design
BOTTOM_VENT_X_OFFSET_MM = 200.0    # from left edge — design
BOTTOM_VENT_Y_OFFSET_MM = 130.0    # from front edge — design

# Vent slot dimensions
VENT_STYLE = 1               # 0=round holes, 1=slots
VENT_SLOT_H_MM = 4.0
VENT_SLOT_W_MM = 50.0
VENT_SLOT_SPACING_X_MM = 56.0
VENT_SLOT_SPACING_Y_MM = 8.0
VENT_HOLE_DIA_MM = 5.0
VENT_HOLE_SPACING_MM = 10.0

# ── Cutouts ───────────────────────────────────────────────────────────────────
HANDLE_W_MM = 100.0          # design
HANDLE_H_MM = 50.0           # design
HANDLE_Z_FROM_TOP_MM = 20.0  # design
HANDLE_CORNER_R_MM = 6.0     # design

ACCESS_DOOR_W_MM = 180.0     # design
ACCESS_DOOR_H_MM = 140.0     # design
ACCESS_DOOR_BOTTOM_MM = 30.0 # from bottom edge — design
ACCESS_DOOR_Y_OFFSET_MM = 80.0  # from front edge of end panel — design

POWER_INLET_DIA_MM = 28.0    # Anderson SB50 panel mount — spec
POWER_INLET_X_MM = 50.0      # from edge — design
POWER_INLET_Y_MM = 40.0      # from bottom — design

POWER_SWITCH_DIA_MM = 22.0   # LED ring switch — spec
POWER_SWITCH_X_MM = 50.0     # from edge — design
POWER_SWITCH_Y_MM = 90.0     # from bottom — design

BSP_DIAMETER_MM = 20.96      # 1/2 inch BSP bore — spec
BSP_X_OFFSET_MM = 0.0        # centered — design
BSP_Y_OFFSET_MM = 0.0        # centered — design

GLAND_M12_DIA_MM = 12.0      # spec
GLAND_M16_DIA_MM = 16.0      # spec

# ── Joining / Assembly ────────────────────────────────────────────────────────
FLANGE_WIDTH_MM = 15.0       # overlap width — design
SPLIT_RATIO = 0.5            # where halves divide (midpoint)
SCREW_HOLE_DIA_MM = 5.0      # M4 clearance oversized to 5mm for tolerance (see note below)
SCREW_SPACING_MM = 50.0      # center-to-center along flange
SCREW_EDGE_OFFSET_MM = 7.5   # screw center from flange edge

# Note on screw holes: oversized from 4.2mm to 5mm because with 6 bends across
# 2 panels, worst-case misalignment = 1.2mm. 4.2mm gives only 0.2mm play.
# 5mm gives 1mm play per side. Inner panel uses M4 PEM nuts (fixed position).

# ── Clearances ────────────────────────────────────────────────────────────────
ASSEMBLY_GAP_MM = 10.0       # tolerance gap — design
TEXTURE_CLEARANCE_MM = 16.0  # wave texture relief (8mm x 2 sides) — design
COMPONENT_BAY_EXTENSION_MM = 130.0  # extra length for pump + fuse box bay — design
EDGE_FILLET_MM = 5.0         # press brake fillet on horizontal edges — design


# ── Standard Sheet Sizes (for flat pattern validation) ────────────────────────
STANDARD_SHEET_W_MM = 1500.0  # standard 5052-H32 sheet width
STANDARD_SHEET_L_MM = 3000.0  # standard 5052-H32 sheet length


def bend_allowance(angle_deg: float, radius: float = BEND_RADIUS_MM,
                   thickness: float = SHEET_THICKNESS_MM, k: float = K_FACTOR) -> float:
    """Calculate bend allowance for a given angle."""
    import math
    return (math.pi / 180) * angle_deg * (radius + k * thickness)


def flat_length_piece1() -> float:
    """Piece 1 (U-channel): FRONT + LEFT_END + RIGHT_END. 2 bends at 90 deg."""
    ba = bend_allowance(90)
    front = SHELL_LENGTH_MM
    left_end = SHELL_WIDTH_MM / 2  # half-width end panels
    right_end = SHELL_WIDTH_MM / 2
    return front + left_end + right_end + 2 * ba


def flat_length_piece2() -> float:
    """Piece 2 (C-channel): TOP + BACK + BOTTOM. 2 bends at 90 deg."""
    ba = bend_allowance(90)
    top = SHELL_WIDTH_MM
    back = SHELL_HEIGHT_MM
    bottom = SHELL_WIDTH_MM
    return top + back + bottom + 2 * ba


# ═══════════════════════════════════════════════════════════════════════════════
# VALIDATION — Comprehensive constraint checks
# If any check fails, DXF export MUST be blocked.
# ═══════════════════════════════════════════════════════════════════════════════

def _check(name: str, available: float, required: float, min_margin: float = 0) -> dict:
    """Helper: create a validation result entry."""
    margin = available - required
    return {
        'check': name,
        'available': round(available, 2),
        'required': round(required, 2),
        'margin': round(margin, 2),
        'status': 'OK' if margin >= min_margin else 'FAIL',
    }


def validate_all() -> dict:
    """
    Run ALL constraint checks. Returns dict with 'checks' list and 'overall' status.
    This is the gate that must pass before any DXF export.
    """
    checks = []
    inner_w = SHELL_WIDTH_MM - 2 * SHEET_THICKNESS_MM
    inner_l = SHELL_LENGTH_MM - 2 * SHEET_THICKNESS_MM
    inner_h = SHELL_HEIGHT_MM - 2 * SHEET_THICKNESS_MM

    # ── 1. P22 fits inside shell ──────────────────────────────────────────
    checks.append(_check('P22 width vs shell inner width', inner_w, P22_WIDTH_MM, min_margin=5))
    checks.append(_check('P22 length vs shell inner length', inner_l, P22_LENGTH_MM, min_margin=5))
    checks.append(_check('P22 height vs shell inner height', inner_h, P22_HEIGHT_MM, min_margin=5))

    # ── 2. Cutouts fit within their faces ─────────────────────────────────
    # Display on front face (length x height)
    display_right_edge = DISPLAY_LEFT_OFFSET_MM + DISPLAY_W_MM + (inner_w - P22_WIDTH_MM) / 2
    checks.append(_check('Display cutout within front face width', inner_l, DISPLAY_W_MM))
    checks.append(_check('Display cutout within front face height', inner_h, DISPLAY_BOTTOM_OFFSET_MM + DISPLAY_H_MM))

    # Handle on end panels (width x height)
    checks.append(_check('Handle cutout within end panel width', inner_w, HANDLE_W_MM))
    handle_top_edge = HANDLE_Z_FROM_TOP_MM + HANDLE_H_MM
    checks.append(_check('Handle cutout within end panel height', inner_h, handle_top_edge))

    # Access door on end panel
    checks.append(_check('Access door within end panel width', inner_l, ACCESS_DOOR_Y_OFFSET_MM + ACCESS_DOOR_W_MM))
    checks.append(_check('Access door within end panel height', inner_h, ACCESS_DOOR_BOTTOM_MM + ACCESS_DOOR_H_MM))

    # Power inlet on back face
    checks.append(_check('Power inlet within back face (from edge)', inner_w, POWER_INLET_X_MM + POWER_INLET_DIA_MM / 2))
    checks.append(_check('Power inlet within back face (from bottom)', inner_h, POWER_INLET_Y_MM + POWER_INLET_DIA_MM / 2))

    # Power switch on back face
    checks.append(_check('Power switch within back face (from edge)', inner_w, POWER_SWITCH_X_MM + POWER_SWITCH_DIA_MM / 2))
    checks.append(_check('Power switch within back face (from bottom)', inner_h, POWER_SWITCH_Y_MM + POWER_SWITCH_DIA_MM / 2))

    # ── 3. Vent zones fit within their faces ──────────────────────────────
    checks.append(_check('Front vent within front face (X)', inner_l, FRONT_VENT_X_OFFSET_MM + FRONT_VENT_W_MM))
    checks.append(_check('Front vent within front face (Y)', inner_h, FRONT_VENT_Y_OFFSET_MM + FRONT_VENT_H_MM))
    checks.append(_check('Back vent within back face (width)', inner_l, BACK_VENT_W_MM))
    checks.append(_check('Back vent within back face (height)', inner_h, BACK_VENT_BOTTOM_OFFSET_MM + BACK_VENT_H_MM))
    checks.append(_check('Side vent within end panel (width)', inner_l, SIDE_VENT_W_MM))
    checks.append(_check('Side vent within end panel (height)', inner_h, SIDE_VENT_Y_OFFSET_MM + SIDE_VENT_H_MM))
    checks.append(_check('Bottom vent within bottom face (X)', inner_l, BOTTOM_VENT_X_OFFSET_MM + BOTTOM_VENT_W_MM))
    checks.append(_check('Bottom vent within bottom face (Y)', inner_w, BOTTOM_VENT_Y_OFFSET_MM + BOTTOM_VENT_H_MM))

    # ── 4. Flat patterns fit on standard sheet ────────────────────────────
    fp1 = flat_length_piece1()
    fp2 = flat_length_piece2()
    checks.append(_check('Piece 1 flat length fits standard sheet', STANDARD_SHEET_L_MM, fp1))
    checks.append(_check('Piece 1 flat width (shell height) fits standard sheet', STANDARD_SHEET_W_MM, SHELL_HEIGHT_MM))
    checks.append(_check('Piece 2 flat length fits standard sheet', STANDARD_SHEET_L_MM, fp2))
    checks.append(_check('Piece 2 flat width (shell length) fits standard sheet', STANDARD_SHEET_W_MM, SHELL_LENGTH_MM))

    # ── 5. Bend feasibility ───────────────────────────────────────────────
    min_flange = 3.5 * SHEET_THICKNESS_MM  # minimum flange length for press brake
    split_h = SHELL_HEIGHT_MM * SPLIT_RATIO
    checks.append(_check('Split height allows press brake (piece 1)', split_h, min_flange))
    checks.append(_check('End panel width allows press brake', SHELL_WIDTH_MM / 2, min_flange))

    # ── 6. Assembly clearances ────────────────────────────────────────────
    foam_gap = (inner_w - P22_WIDTH_MM) / 2
    checks.append(_check('Foam spacer gap (each side)', foam_gap, 5.0))  # min 5mm for foam
    checks.append(_check('Flange width sufficient for screws', FLANGE_WIDTH_MM, SCREW_EDGE_OFFSET_MM + SCREW_HOLE_DIA_MM / 2))

    # ── 7. No cutout overlaps (basic proximity checks) ────────────────────
    # Power inlet and power switch on same face -- must not overlap
    vertical_gap = abs(POWER_SWITCH_Y_MM - POWER_INLET_Y_MM) - (POWER_SWITCH_DIA_MM + POWER_INLET_DIA_MM) / 2
    checks.append({
        'check': 'Power inlet/switch no overlap',
        'available': round(vertical_gap, 2),
        'required': 0,
        'margin': round(vertical_gap, 2),
        'status': 'OK' if vertical_gap > 0 else 'FAIL',
    })

    # ── Summary ───────────────────────────────────────────────────────────
    failures = [c for c in checks if c['status'] == 'FAIL']
    return {
        'checks': checks,
        'total': len(checks),
        'passed': len(checks) - len(failures),
        'failed': len(failures),
        'failures': failures,
        'overall': 'PASS' if len(failures) == 0 else 'FAIL',
    }


def validate_before_export() -> bool:
    """
    Gate function: returns True if DXF export is safe, False if blocked.
    Prints a report either way.
    """
    result = validate_all()
    if result['overall'] == 'PASS':
        print(f"VALIDATION PASSED: {result['passed']}/{result['total']} checks OK")
        print("DXF export is safe to proceed.")
        return True
    else:
        print(f"VALIDATION FAILED: {result['failed']}/{result['total']} checks FAILED")
        print("\nFailing checks:")
        for f in result['failures']:
            print(f"  FAIL: {f['check']} -- available={f['available']}mm, required={f['required']}mm, margin={f['margin']}mm")
        print("\nDXF EXPORT BLOCKED. Fix the failing constraints before generating files.")
        return False


# Legacy alias
validate_clearances = validate_all


# ═══════════════════════════════════════════════════════════════════════════════
# SVG PREVIEW — Visual flat pattern for quick verification
# ═══════════════════════════════════════════════════════════════════════════════

def generate_svg_preview(output_path: str = 'shell_preview.svg', scale: float = 0.4) -> str:
    """
    Generate an SVG showing both flat patterns side by side with cutout positions.
    Returns the output file path.

    This is NOT a fabrication drawing. It's a quick visual check that:
    - The flat pattern dimensions look right
    - Cutouts are positioned correctly on their faces
    - Nothing is obviously wrong before opening a CAD viewer
    """
    fp1_l = flat_length_piece1()
    fp2_l = flat_length_piece2()

    # SVG canvas with padding
    pad = 40
    gap = 60  # gap between the two pieces
    canvas_w = max(fp1_l, fp2_l) * scale + 2 * pad
    canvas_h = (SHELL_HEIGHT_MM + SHELL_LENGTH_MM + gap) * scale + 2 * pad + 80  # extra for labels

    inner_w = SHELL_WIDTH_MM - 2 * SHEET_THICKNESS_MM
    inner_h = SHELL_HEIGHT_MM - 2 * SHEET_THICKNESS_MM

    lines = []
    lines.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {canvas_w:.0f} {canvas_h:.0f}" '
                 f'width="{canvas_w:.0f}" height="{canvas_h:.0f}" style="background:#fff">')
    lines.append('<style>')
    lines.append('  .outline { fill:none; stroke:#333; stroke-width:1.5 }')
    lines.append('  .cutout { fill:#e8f0fe; stroke:#1a73e8; stroke-width:1 }')
    lines.append('  .bend { stroke:#f44336; stroke-width:1; stroke-dasharray:8,4 }')
    lines.append('  .label { font:bold 11px sans-serif; fill:#333 }')
    lines.append('  .dim { font:10px monospace; fill:#666 }')
    lines.append('  .title { font:bold 14px sans-serif; fill:#333 }')
    lines.append('  .vent { fill:none; stroke:#4caf50; stroke-width:0.8 }')
    lines.append('</style>')

    def s(v):
        """Scale a dimension."""
        return v * scale

    # ── Piece 1: U-channel (FRONT + LEFT_END + RIGHT_END) ─────────────────
    p1_x, p1_y = pad, pad + 20
    p1_w = s(fp1_l)
    p1_h = s(SHELL_HEIGHT_MM)

    lines.append(f'<text x="{p1_x}" y="{p1_y - 5}" class="title">Piece 1: U-channel (Front + Ends) -- {fp1_l:.1f} x {SHELL_HEIGHT_MM:.0f}mm</text>')
    lines.append(f'<rect x="{p1_x}" y="{p1_y}" width="{p1_w:.1f}" height="{p1_h:.1f}" class="outline"/>')

    # Bend lines for Piece 1
    ba = bend_allowance(90)
    left_end_w = SHELL_WIDTH_MM / 2
    bend1_x = p1_x + s(left_end_w)
    bend2_x = p1_x + s(left_end_w + ba + SHELL_LENGTH_MM)
    lines.append(f'<line x1="{bend1_x:.1f}" y1="{p1_y}" x2="{bend1_x:.1f}" y2="{p1_y + p1_h:.1f}" class="bend"/>')
    lines.append(f'<line x1="{bend2_x:.1f}" y1="{p1_y}" x2="{bend2_x:.1f}" y2="{p1_y + p1_h:.1f}" class="bend"/>')

    # Front face region (between bends)
    front_x = p1_x + s(left_end_w + ba)
    front_w = s(SHELL_LENGTH_MM)

    # Display cutout on front face
    display_x = front_x + s(DISPLAY_LEFT_OFFSET_MM + (inner_w - P22_WIDTH_MM) / 2)
    display_y = p1_y + p1_h - s(DISPLAY_BOTTOM_OFFSET_MM + DISPLAY_H_MM)
    lines.append(f'<rect x="{display_x:.1f}" y="{display_y:.1f}" width="{s(DISPLAY_W_MM):.1f}" height="{s(DISPLAY_H_MM):.1f}" class="cutout"/>')
    lines.append(f'<text x="{display_x + s(DISPLAY_W_MM)/2:.1f}" y="{display_y + s(DISPLAY_H_MM)/2 + 4:.1f}" '
                 f'text-anchor="middle" class="dim">Display {DISPLAY_W_MM:.0f}x{DISPLAY_H_MM:.0f}</text>')

    # Front vent zone
    fv_x = front_x + s(FRONT_VENT_X_OFFSET_MM)
    fv_y = p1_y + p1_h - s(FRONT_VENT_Y_OFFSET_MM + FRONT_VENT_H_MM)
    lines.append(f'<rect x="{fv_x:.1f}" y="{fv_y:.1f}" width="{s(FRONT_VENT_W_MM):.1f}" height="{s(FRONT_VENT_H_MM):.1f}" class="vent"/>')

    # Handle cutouts on end panels
    for end_x_base in [p1_x, bend2_x + s(ba)]:  # left end, right end
        end_w = s(left_end_w)
        hx = end_x_base + (end_w - s(HANDLE_W_MM)) / 2
        hy = p1_y + s(HANDLE_Z_FROM_TOP_MM)
        lines.append(f'<rect x="{hx:.1f}" y="{hy:.1f}" width="{s(HANDLE_W_MM):.1f}" height="{s(HANDLE_H_MM):.1f}" rx="{s(HANDLE_CORNER_R_MM):.1f}" class="cutout"/>')

    # ── Piece 2: C-channel (TOP + BACK + BOTTOM) ─────────────────────────
    p2_x = pad
    p2_y = p1_y + p1_h + gap
    p2_w = s(fp2_l)
    p2_h = s(SHELL_LENGTH_MM)

    lines.append(f'<text x="{p2_x}" y="{p2_y - 5}" class="title">Piece 2: C-channel (Top + Back + Bottom) -- {fp2_l:.1f} x {SHELL_LENGTH_MM:.0f}mm</text>')
    lines.append(f'<rect x="{p2_x}" y="{p2_y}" width="{p2_w:.1f}" height="{p2_h:.1f}" class="outline"/>')

    # Bend lines for Piece 2
    top_w = SHELL_WIDTH_MM
    bend3_x = p2_x + s(top_w)
    bend4_x = p2_x + s(top_w + ba + SHELL_HEIGHT_MM)
    lines.append(f'<line x1="{bend3_x:.1f}" y1="{p2_y}" x2="{bend3_x:.1f}" y2="{p2_y + p2_h:.1f}" class="bend"/>')
    lines.append(f'<line x1="{bend4_x:.1f}" y1="{p2_y}" x2="{bend4_x:.1f}" y2="{p2_y + p2_h:.1f}" class="bend"/>')

    # Back face region (between bends on piece 2)
    back_x = p2_x + s(top_w + ba)
    back_w = s(SHELL_HEIGHT_MM)

    # Power inlet on back face
    pi_cx = back_x + s(POWER_INLET_X_MM)
    pi_cy = p2_y + p2_h - s(POWER_INLET_Y_MM)
    lines.append(f'<circle cx="{pi_cx:.1f}" cy="{pi_cy:.1f}" r="{s(POWER_INLET_DIA_MM/2):.1f}" class="cutout"/>')

    # Power switch on back face
    ps_cx = back_x + s(POWER_SWITCH_X_MM)
    ps_cy = p2_y + p2_h - s(POWER_SWITCH_Y_MM)
    lines.append(f'<circle cx="{ps_cx:.1f}" cy="{ps_cy:.1f}" r="{s(POWER_SWITCH_DIA_MM/2):.1f}" class="cutout"/>')

    # Back vent zone
    bv_x = back_x + back_w - s(BACK_VENT_RIGHT_OFFSET_MM + BACK_VENT_W_MM)
    bv_y = p2_y + p2_h - s(BACK_VENT_BOTTOM_OFFSET_MM + BACK_VENT_H_MM)
    lines.append(f'<rect x="{bv_x:.1f}" y="{bv_y:.1f}" width="{s(BACK_VENT_W_MM):.1f}" height="{s(BACK_VENT_H_MM):.1f}" class="vent"/>')

    # ── Validation summary ────────────────────────────────────────────────
    result = validate_all()
    summary_y = p2_y + p2_h + 25
    status_color = '#4caf50' if result['overall'] == 'PASS' else '#f44336'
    lines.append(f'<text x="{pad}" y="{summary_y}" class="title" fill="{status_color}">'
                 f'Validation: {result["overall"]} ({result["passed"]}/{result["total"]} checks)</text>')
    if result['failures']:
        for i, f in enumerate(result['failures'][:3]):
            lines.append(f'<text x="{pad}" y="{summary_y + 18 + i*15}" class="dim" fill="#f44336">'
                         f'FAIL: {f["check"]} (margin={f["margin"]}mm)</text>')

    lines.append('</svg>')
    svg_content = '\n'.join(lines)

    with open(output_path, 'w') as f:
        f.write(svg_content)
    return output_path


if __name__ == '__main__':
    import json
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == 'svg':
        path = generate_svg_preview()
        print(f"SVG preview written to: {path}")
    elif len(sys.argv) > 1 and sys.argv[1] == 'export-check':
        ok = validate_before_export()
        sys.exit(0 if ok else 1)
    else:
        result = validate_all()
        print(json.dumps(result, indent=2, default=str))
        print(f"\n{result['overall']}: {result['passed']}/{result['total']} checks passed")
        if result['failures']:
            print(f"\nFAILURES:")
            for f in result['failures']:
                print(f"  {f['check']}: margin={f['margin']}mm")

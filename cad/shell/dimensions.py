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


def validate_clearances() -> dict:
    """Check that P22 fits inside shell with all required clearances."""
    results = {}

    # P22 width vs shell width
    available_w = SHELL_WIDTH_MM - 2 * SHEET_THICKNESS_MM
    p22_clearance = available_w - P22_WIDTH_MM
    results['p22_width_clearance'] = {
        'available': available_w,
        'required': P22_WIDTH_MM,
        'margin': p22_clearance,
        'status': 'OK' if p22_clearance > 0 else 'FAIL',
    }

    # Display cutout fits on front face
    display_clearance = (SHELL_LENGTH_MM - 2 * SHEET_THICKNESS_MM) - DISPLAY_W_MM
    results['display_cutout'] = {
        'available': SHELL_LENGTH_MM - 2 * SHEET_THICKNESS_MM,
        'required': DISPLAY_W_MM,
        'margin': display_clearance,
        'status': 'OK' if display_clearance > 0 else 'FAIL',
    }

    # Handle cutout fits on end panel
    handle_clearance = available_w - HANDLE_W_MM
    results['handle_cutout'] = {
        'available': available_w,
        'required': HANDLE_W_MM,
        'margin': handle_clearance,
        'status': 'OK' if handle_clearance > 0 else 'FAIL',
    }

    # Overall pass/fail
    results['overall'] = 'OK' if all(
        v['status'] == 'OK' for v in results.values() if isinstance(v, dict)
    ) else 'FAIL'

    return results


if __name__ == '__main__':
    import json
    result = validate_clearances()
    print(json.dumps(result, indent=2))
    print(f"\nOverall: {result['overall']}")

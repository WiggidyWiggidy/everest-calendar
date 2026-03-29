# ISU-001 Shell CAD Files

All shell design files live here under version control.

## Rules
1. **Plan mode required** before any geometry or dimension change
2. Every dimension must have a source (factory_caliper, step_caliper, supplier_quote, design, spec)
3. Run `python dimensions.py` after any change to validate clearances
4. The Supabase `shell_design_revisions` table is the audit trail — update it when dimensions change

## Files
- `dimensions.py` — Single source of truth for all shell dimensions + clearance validation
- Future: `shell_final.py`, `dxf_flat_patterns.py` (to be rebuilt from v1.0 baseline)

## Version History
- v1.0 (29 Mar 2026): Rectangular shell baseline, 580x402x500mm. Pre-taper.

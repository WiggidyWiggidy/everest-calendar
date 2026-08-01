# Experiment and Release Reviewer

Role: independent gate before customer-facing changes or experiment decisions.

Inputs:

- Experiment packet.
- Page/ad patch plan.
- Copy gate output.
- Source-health.
- Screenshots and readback evidence.
- Measurement spine health.

Outputs:

- PASS, REVISE, REJECT, or PENDING_EVIDENCE.
- Risks.
- Required fixes.
- Rollback check.

Checks:

- One major variable.
- Message match between ad and LP.
- Claims and specs.
- Tracking identifiers.
- Event validation.
- Source freshness.
- Deployment and rollback path.

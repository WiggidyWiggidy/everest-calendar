# Learning Loop — how the system gets smarter across sessions

The engine that turns a stateless agent into one that compounds. Without this, every session starts cold
and repeats old mistakes. Governed by `SYSTEM.md`; measured by `../evals/`.

## Memory stores (what persists, and what each holds)
| Store | Holds |
|---|---|
| `marketing/findings/` ledger | Every labelled finding with evidence; superseded only by reconciliation (no silent reversal). |
| `data-contracts/confirmed-facts.md` | Ground-truth facts confirmed by Tom/source (launch dates, economics, tracking-valid windows). |
| `source-of-truth/customer-language.md` | Real customer phrasing (voice-of-customer). |
| `marketing_learnings` / `hypothesis_learnings` (Supabase) | Predicted-vs-actual per experiment; ICE priors. |
| **`marketing/agents/calibration-log.md`** | Each prediction's stated confidence vs outcome — tunes future confidence. |

## BOOT (start of every session/task — non-optional)
1. Load `SYSTEM.md` + rules + data-contracts.
2. Load MEMORY: open findings, active learnings, confirmed-facts, calibration priors, customer-language.
3. State what's already known vs UNKNOWN for this task before doing anything. (Prevents re-deriving/regressing.)

## CLOSE (end of every session/task — non-optional)
1. Write new findings to the ledger (labelled · source · window · n).
2. Record predicted-vs-actual to the calibration log + `hypothesis_learnings`.
3. Update `confirmed-facts.md` / `customer-language.md` with anything newly confirmed.
4. **Postmortem → update the scaffolding (the core get-smarter step):** if a claim was wrong, a fact was
   inferred, a source was mis-trusted, or a rule was missing — do NOT just fix the answer. Update the
   relevant **rule / agent / contract** so it cannot recur, and add a one-line changelog entry. Then add a
   regression case to `../evals/` so the fix is tested forever. (This is exactly how this system was built:
   every failure this week became a rule. Now it's automatic, not manual.)

## Calibration (make "high confidence" mean something)
- Log each prediction: statement · confidence · n · outcome (when known).
- Periodically compute: when it said FACT, how often was it right? PATTERN? If confidence is
  mis-calibrated, tighten the language rules. Confidence that isn't scored is just vibes.

## The improvement invariant
The system gets smarter only if **errors edit the scaffolding, not just the output.** A correction that
doesn't produce (a) a scaffolding change and (b) a regression eval is incomplete. Red-team and Tom
enforce this at CLOSE.

## Anti-patterns (explicitly banned)
- Starting work without BOOT (re-deriving known facts, repeating fixed mistakes).
- "Learning" that lives only in one session's chat and is never written down.
- Fixing an answer without asking "what rule would have caught this?"

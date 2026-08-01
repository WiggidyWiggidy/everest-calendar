#!/usr/bin/env bash
# Regression suite: replays known-wrong claims through the instrument-validation gate.
# Every historical error becomes a permanent test. Run before trusting any session's output.
set -u
V="node marketing/evals/validate-claim.mjs --json"
pass=0; fail=0
must_block(){ d="$1"; shift; if $V "$@" 2>&1 | grep -q '"ok": true'; then echo "  FAIL (let through): $d"; fail=$((fail+1)); else echo "  ok  blocked: $d"; pass=$((pass+1)); fi; }
must_pass(){ d="$1"; shift; if $V "$@" 2>&1 | grep -q '"ok": true'; then echo "  ok  passed:  $d"; pass=$((pass+1)); else echo "  FAIL (blocked a sound claim): $d"; fail=$((fail+1)); fi; }

echo "== fact-location lint: no business figures in rules/agents =="
if node marketing/evals/lint-facts.mjs > /dev/null 2>&1; then echo "  ok  lint clean"; pass=$((pass+1)); else echo "  FAIL: figures found in rules/agents (run: node marketing/evals/lint-facts.mjs)"; fail=$((fail+1)); fi
echo "== team wiring: agents have inputs, handoffs, shared state, and a caller =="
if node marketing/evals/lint-team.mjs > /dev/null 2>&1; then echo "  ok  team-wiring clean"; pass=$((pass+1)); else echo "  FAIL: agents not wired (run: node marketing/evals/lint-team.mjs)"; fail=$((fail+1)); fi
echo
echo "== handoff graph: coherent, no dead ends or islands =="
if node marketing/evals/lint-graph.mjs > /dev/null 2>&1; then echo "  ok  graph clean"; pass=$((pass+1)); else echo "  FAIL: broken handoff graph (run: node marketing/evals/lint-graph.mjs)"; fail=$((fail+1)); fi
echo
echo "== belief revision: no conclusion rests on a superseded or overdue fact =="
if node marketing/evals/check-dependencies.mjs > /dev/null 2>&1; then echo "  ok  belief-revision clean"; pass=$((pass+1)); else echo "  FAIL: stale conclusions (run: node marketing/evals/check-dependencies.mjs)"; fail=$((fail+1)); fi
echo
echo "== must BLOCK: the 10 wrong claims of 2026-07-31 =="
must_block "aggregate-as-fact (6 checkouts = 6 sales)" --claim "6 completed checkouts means 6 real sales" --instrument "shopify_funnel_daily" --n 6 --fresh --grain aggregate --label FACT
must_block "uptime-blind window comparison"           --claim "July orders fell 80% while spend rose 64%" --instrument "monthly spend sums" --n 6 --grain aggregate --label FACT
must_block "fabricated AOV from unvalidated inputs"   --claim "AOV is 2000.00 per order" --instrument "verbal ~10k / unconfirmed count" --n 5 --fresh --grain derived --label FACT
must_block "false precision at n=3"                   --claim "CPA is A\$177.51 per order" --instrument "spend/orders" --n 3 --fresh --grain source --label FACT
must_block "absence from truncated API"               --claim "no orders exist before 2026-06-02" --instrument "shopify orders.json" --n 5 --fresh --grain source --label FACT --absence
must_block "stale ref read as current"                --claim "main is unchanged at 6ead431" --instrument "local git ref" --n 1 --grain source --label FACT
must_block "filter excluded its target (sticky bar)"  --claim "there is no sticky buy control" --instrument "DOM scan filtered on buy-words" --n 1 --fresh --grain source --label FACT --absence
must_block "filter excluded its target (wa.me)"       --claim "there are no WhatsApp links" --instrument "DOM scan filtered on link text" --n 1 --fresh --grain source --label FACT --absence
must_block "derived from stale input"                 --claim "there are no merge conflicts with main" --instrument "merge-tree vs local ref" --n 1 --grain derived --label FACT --absence
must_block "incomplete filter reported as complete"   --claim "preview traffic overstates ATC by 24.0%" --instrument "host filter only" --n 57 --fresh --grain source --label FACT

echo
echo "== must PASS: sound claims (a gate that blocks everything is useless) =="
must_pass "validated source claim" --claim "5 KRYO unit sales totalling A\$10,748" --instrument "shopify orders.json + Tom-attested" --n 5 --counted 5 --total 5 --fresh --enumerated --filter-complete --grain source --label PATTERN
must_pass "adequate-n rate"        --claim "cost per landing page view is about A\$0.78" --instrument "meta_ad_metrics_daily" --n 679 --counted 679 --total 679 --fresh --filter-complete --grain source --label FACT

echo
echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1

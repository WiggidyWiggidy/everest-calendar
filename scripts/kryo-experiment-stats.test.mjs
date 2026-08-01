#!/usr/bin/env node
import assert from 'node:assert/strict';
import { planBinary, srm, readoutBinary } from './kryo-experiment-stats.mjs';

const plan = planBinary({ baseline: 0.05, treatment: 0.075, alpha: 0.05, power: 0.8, dailyEligible: 100 });
assert.ok(plan.required_per_arm > 1000 && plan.required_per_arm < 2000, `unexpected per-arm sample ${plan.required_per_arm}`);
assert.equal(plan.required_total, plan.required_per_arm * 2);
assert.ok(plan.estimated_days_at_eligible_traffic >= 20);

const srmPass = srm({ controlN: 500, treatmentN: 500 });
assert.equal(srmPass.status, 'PASS_SRM');
assert.ok(srmPass.p_value > 0.9);

const srmFail = srm({ controlN: 650, treatmentN: 350 });
assert.equal(srmFail.status, 'FAIL_SRM');
assert.ok(srmFail.p_value < 0.01);

const readout = readoutBinary({ controlN: 1000, controlConversions: 50, treatmentN: 1000, treatmentConversions: 80 });
assert.equal(readout.control_rate, 0.05);
assert.equal(readout.treatment_rate, 0.08);
assert.ok(readout.absolute_effect > 0);
assert.ok(readout.p_value < 0.05);
assert.equal(readout.significant_fixed_horizon, true);

console.log('kryo-experiment-stats tests: PASS');

#!/usr/bin/env node

// Deterministic fixed-horizon planning/readout helpers for KRYO binary metrics.
// This intentionally does NOT implement optional-stopping/sequential boundaries.
// Use it for pre-registration, SRM checks and fixed-horizon readouts.

function normInv(p) {
  if (!(p > 0 && p < 1)) throw new Error('p must be between 0 and 1');
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1-p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  const q = p - 0.5;
  const r = q*q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429*t - 1.453152027)*t + 1.421413741)*t - 0.284496736)*t + 0.254829592)*t) * Math.exp(-ax*ax);
  return sign * y;
}
function erfc(x) { return 1 - erf(x); }
function normalCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

function assertRate(x, name) {
  if (!(x > 0 && x < 1)) throw new Error(`${name} must be >0 and <1`);
}

export function planBinary({ baseline, treatment, alpha = 0.05, power = 0.8, dailyEligible = null }) {
  assertRate(baseline, 'baseline');
  assertRate(treatment, 'treatment');
  if (baseline === treatment) throw new Error('baseline and treatment cannot be equal');
  const zAlpha = normInv(1 - alpha / 2);
  const zPower = normInv(power);
  const pbar = (baseline + treatment) / 2;
  const delta = Math.abs(treatment - baseline);
  const numerator = Math.pow(
    zAlpha * Math.sqrt(2 * pbar * (1 - pbar)) +
    zPower * Math.sqrt(baseline * (1 - baseline) + treatment * (1 - treatment)),
    2
  );
  const perArm = Math.ceil(numerator / (delta * delta));
  const total = perArm * 2;
  return {
    method: 'two_proportion_z_fixed_horizon_equal_allocation',
    baseline,
    treatment,
    absolute_effect: treatment - baseline,
    relative_effect: (treatment - baseline) / baseline,
    alpha,
    power,
    required_per_arm: perArm,
    required_total: total,
    estimated_days_at_eligible_traffic: dailyEligible ? Math.ceil(total / dailyEligible) : null,
    note: 'Fixed-horizon planning only. Do not repeatedly peek at ordinary p-values and stop early.'
  };
}

export function srm({ controlN, treatmentN, controlAllocation = 0.5, alpha = 0.01 }) {
  const total = controlN + treatmentN;
  if (total <= 0) throw new Error('sample must be positive');
  if (!(controlAllocation > 0 && controlAllocation < 1)) throw new Error('controlAllocation must be between 0 and 1');
  const expectedControl = total * controlAllocation;
  const expectedTreatment = total * (1 - controlAllocation);
  const chi2 = Math.pow(controlN - expectedControl, 2) / expectedControl + Math.pow(treatmentN - expectedTreatment, 2) / expectedTreatment;
  // Chi-square with 1 df: survival function = erfc(sqrt(x/2)).
  const pValue = erfc(Math.sqrt(chi2 / 2));
  return {
    control_n: controlN,
    treatment_n: treatmentN,
    expected_control: expectedControl,
    expected_treatment: expectedTreatment,
    chi_square: chi2,
    p_value: pValue,
    alpha,
    status: pValue < alpha ? 'FAIL_SRM' : 'PASS_SRM'
  };
}

export function readoutBinary({ controlN, controlConversions, treatmentN, treatmentConversions, alpha = 0.05 }) {
  if (!(controlN > 0 && treatmentN > 0)) throw new Error('arm sample sizes must be positive');
  if (controlConversions < 0 || controlConversions > controlN || treatmentConversions < 0 || treatmentConversions > treatmentN) throw new Error('invalid conversion counts');
  const pC = controlConversions / controlN;
  const pT = treatmentConversions / treatmentN;
  const diff = pT - pC;
  const seUnpooled = Math.sqrt(pC*(1-pC)/controlN + pT*(1-pT)/treatmentN);
  const zCrit = normInv(1 - alpha/2);
  const ciLow = diff - zCrit*seUnpooled;
  const ciHigh = diff + zCrit*seUnpooled;
  const pooled = (controlConversions + treatmentConversions) / (controlN + treatmentN);
  const seNull = Math.sqrt(pooled*(1-pooled)*(1/controlN + 1/treatmentN));
  const z = seNull > 0 ? diff / seNull : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return {
    method: 'two_proportion_z_fixed_horizon',
    control_n: controlN,
    control_conversions: controlConversions,
    control_rate: pC,
    treatment_n: treatmentN,
    treatment_conversions: treatmentConversions,
    treatment_rate: pT,
    absolute_effect: diff,
    relative_effect: pC > 0 ? diff / pC : null,
    confidence_level: 1-alpha,
    confidence_interval_absolute: [ciLow, ciHigh],
    z_score: z,
    p_value: pValue,
    significant_fixed_horizon: pValue < alpha,
    note: 'Interpret only after the pre-registered fixed-horizon stop condition and data-quality gates are met.'
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i+1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

function num(args, key, required = true) {
  if (args[key] == null) {
    if (required) throw new Error(`Missing --${key}`);
    return null;
  }
  const n = Number(args[key]);
  if (!Number.isFinite(n)) throw new Error(`--${key} must be numeric`);
  return n;
}

if (process.argv[1] && process.argv[1].endsWith('kryo-experiment-stats.mjs')) {
  try {
    const [mode, ...rest] = process.argv.slice(2);
    const args = parseArgs(rest);
    let result;
    if (mode === 'plan') {
      const baseline = num(args, 'baseline');
      const treatment = args.treatment != null ? num(args, 'treatment') : baseline * (1 + num(args, 'relative-lift'));
      result = planBinary({ baseline, treatment, alpha: args.alpha ? num(args,'alpha') : 0.05, power: args.power ? num(args,'power') : 0.8, dailyEligible: args['daily-eligible'] ? num(args,'daily-eligible') : null });
    } else if (mode === 'srm') {
      result = srm({ controlN: num(args,'control-n'), treatmentN: num(args,'treatment-n'), controlAllocation: args['control-allocation'] ? num(args,'control-allocation') : 0.5, alpha: args.alpha ? num(args,'alpha') : 0.01 });
    } else if (mode === 'readout') {
      result = readoutBinary({ controlN: num(args,'control-n'), controlConversions: num(args,'control-conversions'), treatmentN: num(args,'treatment-n'), treatmentConversions: num(args,'treatment-conversions'), alpha: args.alpha ? num(args,'alpha') : 0.05 });
    } else {
      throw new Error('Usage: plan|srm|readout. Example: node scripts/kryo-experiment-stats.mjs plan --baseline 0.05 --relative-lift 0.5 --daily-eligible 100');
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// Statistical significance testing for A/B experiments
// Z-test for proportions (conversion rates)

interface SignificanceResult {
  significant: boolean;
  confidence: number;        // 0-100 percentage
  p_value: number;
  z_score: number;
  lift_percent: number;
  sample_size_needed: number; // for 95% confidence
  recommendation: string;
}

// Z-test for two proportions (control vs variant)
export function testSignificance(
  controlConversions: number,
  controlSessions: number,
  variantConversions: number,
  variantSessions: number,
  targetConfidence: number = 0.95
): SignificanceResult {
  const p1 = controlSessions > 0 ? controlConversions / controlSessions : 0;
  const p2 = variantSessions > 0 ? variantConversions / variantSessions : 0;
  const n1 = controlSessions;
  const n2 = variantSessions;

  if (n1 === 0 || n2 === 0) {
    return {
      significant: false,
      confidence: 0,
      p_value: 1,
      z_score: 0,
      lift_percent: 0,
      sample_size_needed: calculateSampleSize(p1 || 0.05, 0.1, targetConfidence),
      recommendation: 'Not enough data yet.',
    };
  }

  // Pooled proportion
  const pPooled = (controlConversions + variantConversions) / (n1 + n2);
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2));

  if (se === 0) {
    return {
      significant: false,
      confidence: 0,
      p_value: 1,
      z_score: 0,
      lift_percent: 0,
      sample_size_needed: 1000,
      recommendation: 'No variance in data.',
    };
  }

  const zScore = (p2 - p1) / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore))); // two-tailed
  const confidence = (1 - pValue) * 100;
  const liftPercent = p1 > 0 ? ((p2 - p1) / p1) * 100 : 0;
  const significant = pValue < (1 - targetConfidence);

  // How many more sessions needed for 95% confidence
  const sampleNeeded = calculateSampleSize(p1, Math.abs(p2 - p1) || 0.01, targetConfidence);
  const sessionsNeeded = Math.max(0, sampleNeeded - Math.min(n1, n2));

  let recommendation: string;
  if (significant && liftPercent > 0) {
    recommendation = `Variant wins with ${confidence.toFixed(0)}% confidence (+${liftPercent.toFixed(1)}% lift). Scale it.`;
  } else if (significant && liftPercent < 0) {
    recommendation = `Variant loses with ${confidence.toFixed(0)}% confidence (${liftPercent.toFixed(1)}% drop). Kill it.`;
  } else if (sessionsNeeded > 0) {
    recommendation = `Not significant yet (${confidence.toFixed(0)}% confidence). Need ~${sessionsNeeded} more sessions per variant.`;
  } else {
    recommendation = `Inconclusive. Consider increasing the effect size or running longer.`;
  }

  return {
    significant,
    confidence,
    p_value: pValue,
    z_score: zScore,
    lift_percent: liftPercent,
    sample_size_needed: sampleNeeded,
    recommendation,
  };
}

// Sample size calculator for desired confidence and minimum detectable effect
function calculateSampleSize(
  baselineRate: number,
  minimumDetectableEffect: number,
  confidence: number = 0.95,
  power: number = 0.8
): number {
  const alpha = 1 - confidence;
  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(power);
  const p1 = baselineRate;
  const p2 = baselineRate + minimumDetectableEffect;
  const pAvg = (p1 + p2) / 2;

  const numerator = Math.pow(zAlpha * Math.sqrt(2 * pAvg * (1 - pAvg)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2);
  const denominator = Math.pow(p2 - p1, 2);

  return denominator > 0 ? Math.ceil(numerator / denominator) : 10000;
}

// Standard normal CDF approximation
function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

// Inverse normal (quantile) approximation
function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01,
  ];

  const pLow = 0.02425, pHigh = 1 - pLow;
  let q: number, r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((a[0] * q + a[1]) * q + a[2]) * q + a[3]) * q + a[4]) * q + a[5]) /
           ((((b[0] * q + b[1]) * q + b[2]) * q + b[3]) * q + b[4] + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((a[0] * q + a[1]) * q + a[2]) * q + a[3]) * q + a[4]) * q + a[5]) /
            (((((b[0] * q + b[1]) * q + b[2]) * q + b[3]) * q + b[4]) * q + 1);
  }
}

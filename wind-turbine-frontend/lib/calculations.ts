/**
 * Calculation Utilities
 * Mathematical and statistical functions for дані analysis
 */

/**
 * Calculate percentage change between two values
 */
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue === 0 ? 0 : 100;
  return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
}

/**
 * Calculate trend direction
 * Returns: 1 for increasing, -1 for decreasing, 0 for stable
 */
export function calculateTrendDirection(
  values: number[],
  threshold: number = 2 // percentage threshold
): 1 | -1 | 0 {
  if (values.length < 2) return 0;

  const change = calculatePercentageChange(values[0], values[values.length - 1]);

  if (Math.abs(change) < threshold) return 0;
  return change > 0 ? 1 : -1;
}

/**
 * Calculate moving average (simple)
 */
export function calculateMovingAverage(
  values: number[],
  windowSize: number
): number[] {
  if (values.length === 0 || windowSize <= 0) return [];

  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = values.slice(start, i + 1);
    const average = window.reduce((a, b) => a + b, 0) / window.length;
    result.push(average);
  }

  return result;
}

/**
 * Calculate exponential moving average
 */
export function calculateExponentialMovingAverage(
  values: number[],
  windowSize: number
): number[] {
  if (values.length === 0 || windowSize <= 0) return [];

  const multiplier = 2 / (windowSize + 1);
  const result: number[] = [];
  let ema = values[0];

  result.push(ema);

  for (let i = 1; i < values.length; i++) {
    ema = values[i] * multiplier + ema * (1 - multiplier);
    result.push(ema);
  }

  return result;
}

/**
 * Calculate standard deviation
 */
export function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((value) => Math.pow(value - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

  return Math.sqrt(variance);
}

/**
 * Calculate mean (average)
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Calculate median
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate percentile
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0 || percentile < 0 || percentile > 100) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (lower === upper) {
    return sorted[lower];
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Calculate min value
 */
export function calculateMin(values: number[]): number {
  return values.length === 0 ? 0 : Math.min(...values);
}

/**
 * Calculate max value
 */
export function calculateMax(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

/**
 * Calculate range (max - min)
 */
export function calculateRange(values: number[]): number {
  return calculateMax(values) - calculateMin(values);
}

/**
 * Linear interpolation between two points
 */
export function interpolateLinear(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x: number
): number {
  if (x1 === x0) return y0;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * Linear regression: y = mx + b
 * Returns [slope, intercept, r²]
 */
export function calculateLinearRegression(
  x: number[],
  y: number[]
): [slope: number, intercept: number, r2: number] {
  if (x.length !== y.length || x.length === 0) {
    return [0, 0, 0];
  }

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const yMean = sumY / n;
  const ssRes = y.reduce((sum, yi) => sum + Math.pow(yi - (slope * x[y.indexOf(yi)] + intercept), 2), 0);
  const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return [slope, intercept, r2];
}

/**
 * Polynomial interpolation (Lagrange)
 */
export function interpolatePolynomial(
  xPoints: number[],
  yPoints: number[],
  x: number
): number {
  if (xPoints.length !== yPoints.length || xPoints.length === 0) {
    return 0;
  }

  let result = 0;

  for (let i = 0; i < xPoints.length; i++) {
    let term = yPoints[i];

    for (let j = 0; j < xPoints.length; j++) {
      if (i !== j) {
        term *= (x - xPoints[j]) / (xPoints[i] - xPoints[j]);
      }
    }

    result += term;
  }

  return result;
}

/**
 * Calculate cumulative sum
 */
export function calculateCumulativeSum(values: number[]): number[] {
  const result: number[] = [];
  let sum = 0;

  for (const value of values) {
    sum += value;
    result.push(sum);
  }

  return result;
}

/**
 * Calculate rate of change (derivative)
 */
export function calculateRateOfChange(values: number[], timeInterval: number = 1): number[] {
  const result: number[] = [];

  for (let i = 1; i < values.length; i++) {
    const rate = (values[i] - values[i - 1]) / timeInterval;
    result.push(rate);
  }

  return result;
}

/**
 * Normalize values to 0-1 range
 */
export function normalizeValues(values: number[]): number[] {
  const min = calculateMin(values);
  const max = calculateMax(values);
  const range = max - min;

  if (range === 0) return values.map(() => 0);

  return values.map((v) => (v - min) / range);
}

/**
 * Clamp value between min and max
 */
export function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate exponential growth/decay
 */
export function calculateExponential(
  initialValue: number,
  growthRate: number, // 0.1 = 10% growth
  time: number
): number {
  return initialValue * Math.exp(growthRate * time);
}

/**
 * Calculate compound growth
 */
export function calculateCompoundGrowth(
  principal: number,
  rate: number, // annual rate as decimal (0.05 = 5%)
  time: number, // in years
  compounds: number = 1 // compounds per year
): number {
  return principal * Math.pow(1 + rate / compounds, compounds * time);
}

/**
 * Calculate distance between two points (Euclidean)
 */
export function calculateDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Calculate correlation coefficient
 */
export function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;

  const meanX = calculateMean(x);
  const meanY = calculateMean(y);
  const stdX = calculateStandardDeviation(x);
  const stdY = calculateStandardDeviation(y);

  if (stdX === 0 || stdY === 0) return 0;

  const n = x.length;
  const covariance = x.reduce((sum, xi, i) => sum + (xi - meanX) * (y[i] - meanY), 0) / n;

  return covariance / (stdX * stdY);
}

/**
 * Round to specified decimal places
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

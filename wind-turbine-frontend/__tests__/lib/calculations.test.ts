import {
  calculateMovingAverage,
  calculatePercentile,
  linearInterpolation,
  calculateStandardDeviation,
} from '@/src/lib/calculations';

describe('Calculation Utilities', () => {
  describe('calculateMovingAverage', () => {
    it('should calculate moving average', () => {
      const data = [1, 2, 3, 4, 5];
      const avg = calculateMovingAverage(data, 3);
      expect(avg).toHaveLength(3); // 5 - 3 + 1
      expect(avg[0]).toBe(2); // (1+2+3)/3
      expect(avg[1]).toBe(3); // (2+3+4)/3
      expect(avg[2]).toBe(4); // (3+4+5)/3
    });

    it('should handle window larger than data', () => {
      const data = [1, 2, 3];
      const avg = calculateMovingAverage(data, 5);
      expect(avg.length).toBeLessThanOrEqual(data.length);
    });

    it('should handle empty array', () => {
      const avg = calculateMovingAverage([], 3);
      expect(avg).toHaveLength(0);
    });
  });

  describe('calculatePercentile', () => {
    it('should calculate percentile values', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const p50 = calculatePercentile(data, 50);
      expect(p50).toBeGreaterThanOrEqual(4);
      expect(p50).toBeLessThanOrEqual(6);

      const p95 = calculatePercentile(data, 95);
      expect(p95).toBeGreaterThan(p50);
    });

    it('should return first element for 0th percentile', () => {
      const data = [10, 20, 30];
      const p0 = calculatePercentile(data, 0);
      expect(p0).toBe(10);
    });

    it('should return last element for 100th percentile', () => {
      const data = [10, 20, 30];
      const p100 = calculatePercentile(data, 100);
      expect(p100).toBe(30);
    });
  });

  describe('linearInterpolation', () => {
    it('should interpolate between two points', () => {
      const result = linearInterpolation(0, 10, 0, 100, 5);
      expect(result).toBe(50);
    });

    it('should handle endpoints', () => {
      expect(linearInterpolation(0, 10, 0, 100, 0)).toBe(0);
      expect(linearInterpolation(0, 10, 0, 100, 10)).toBe(100);
    });

    it('should handle negative values', () => {
      const result = linearInterpolation(-10, 10, 0, 100, 0);
      expect(result).toBe(50);
    });
  });

  describe('calculateStandardDeviation', () => {
    it('should calculate standard deviation', () => {
      const data = [1, 2, 3, 4, 5];
      const sd = calculateStandardDeviation(data);
      expect(sd).toBeGreaterThan(0);
      expect(sd).toBeLessThan(10);
    });

    it('should return 0 for identical values', () => {
      const data = [5, 5, 5, 5];
      const sd = calculateStandardDeviation(data);
      expect(sd).toBeCloseTo(0, 5);
    });

    it('should handle single value', () => {
      const data = [42];
      const sd = calculateStandardDeviation(data);
      expect(sd).toBe(0);
    });
  });
});

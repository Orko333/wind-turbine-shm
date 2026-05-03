import {
  formatPower,
  formatPercentage,
  formatRUL,
  formatStress,
  formatDate,
  formatNumber,
} from '@/src/lib/formatting';

describe('Formatting Utilities', () => {
  describe('formatPower', () => {
    it('should format power in kW', () => {
      expect(formatPower(1500)).toBe('1.5 MW');
      expect(formatPower(500)).toBe('500 kW');
      expect(formatPower(2000)).toBe('2.0 MW');
    });

    it('should handle zero power', () => {
      expect(formatPower(0)).toBe('0 kW');
    });

    it('should handle large values', () => {
      expect(formatPower(5000)).toBe('5.0 MW');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentage values', () => {
      expect(formatPercentage(0.85)).toBe('85.0%');
      expect(formatPercentage(0.5)).toBe('50.0%');
      expect(formatPercentage(1)).toBe('100.0%');
    });

    it('should handle zero percentage', () => {
      expect(formatPercentage(0)).toBe('0.0%');
    });

    it('should handle decimal percentages', () => {
      expect(formatPercentage(0.333)).toBe('33.3%');
    });
  });

  describe('formatRUL', () => {
    it('should format RUL in months', () => {
      expect(formatRUL(12)).toBe('1 year');
      expect(formatRUL(6)).toBe('6 months');
      expect(formatRUL(24)).toBe('2 years');
    });

    it('should handle zero RUL', () => {
      expect(formatRUL(0)).toBe('0 months');
    });
  });

  describe('formatStress', () => {
    it('should format stress values in MPa', () => {
      expect(formatStress(250)).toBe('250 MPa');
      expect(formatStress(120.5)).toBe('120.5 MPa');
    });
  });

  describe('formatDate', () => {
    it('should format date string', () => {
      const date = '2025-05-02';
      expect(formatDate(date)).toContain('May');
      expect(formatDate(date)).toContain('2');
      expect(formatDate(date)).toContain('2025');
    });
  });

  describe('formatNumber', () => {
    it('should format numbers with thousand separators', () => {
      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(1000000)).toBe('1,000,000');
      expect(formatNumber(123)).toBe('123');
    });

    it('should handle decimals', () => {
      expect(formatNumber(1234.56, 2)).toBe('1,234.56');
    });
  });
});

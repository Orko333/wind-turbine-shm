import {
  isTokenValid,
  decodeToken,
  validatePasswordStrength,
} from '@/src/lib/auth';

describe('Auth Utilities', () => {
  describe('isTokenValid', () => {
    it('should return false for expired token', () => {
      const expiredTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const payload = Buffer.from(JSON.stringify({ exp: expiredTime })).toString('base64');
      const token = `header.${payload}.signature`;
      expect(isTokenValid(token)).toBe(false);
    });

    it('should return false for invalid token', () => {
      expect(isTokenValid('invalid.token')).toBe(false);
      expect(isTokenValid('')).toBe(false);
    });

    it('should return true for valid token', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const payload = Buffer.from(JSON.stringify({ exp: futureTime })).toString('base64');
      const token = `header.${payload}.signature`;
      expect(isTokenValid(token)).toBe(true);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should reject weak passwords', () => {
      expect(validatePasswordStrength('123')).toBe(false);
      expect(validatePasswordStrength('abc')).toBe(false);
      expect(validatePasswordStrength('password')).toBe(false);
    });

    it('should reject passwords without uppercase', () => {
      expect(validatePasswordStrength('password123!')).toBe(false);
    });

    it('should reject passwords without numbers', () => {
      expect(validatePasswordStrength('Password!')).toBe(false);
    });

    it('should reject passwords without special characters', () => {
      expect(validatePasswordStrength('Password123')).toBe(false);
    });

    it('should accept strong passwords', () => {
      expect(validatePasswordStrength('SecurePass123!')).toBe(true);
      expect(validatePasswordStrength('MyP@ssw0rd')).toBe(true);
    });

    it('should require minimum length', () => {
      expect(validatePasswordStrength('P@ss12')).toBe(false); // Too short
      expect(validatePasswordStrength('P@ssw0rd')).toBe(true); // At least 8 chars
    });
  });

  describe('decodeToken', () => {
    it('should decode valid JWT token', () => {
      const payload = { userId: '123', email: 'test@example.com' };
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const token = `header.${encodedPayload}.signature`;

      const decoded = decodeToken(token);
      expect(decoded).toEqual(payload);
    });

    it('should return null for invalid token', () => {
      expect(decodeToken('invalid')).toBeNull();
      expect(decodeToken('')).toBeNull();
    });

    it('should handle malformed payload', () => {
      const token = 'header.invalid-base64.signature';
      expect(decodeToken(token)).toBeNull();
    });
  });
});

/**
 * Authentication Utilities
 * JWT token handling, validation, and password strength checking
 */

/**
 * JWT payload interface
 */
interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
}

/**
 * Decode JWT token without verification
 * Note: This is client-side only. Token should be verified on server.
 */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(parts[1], "base64").toString("utf-8")
    ) as JwtPayload;

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Check if JWT token is valid and not expired
 */
export function isTokenValid(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload) return false;

  const expiryTime = payload.exp * 1000; // Convert to milliseconds
  const currentTime = Date.now();

  return currentTime < expiryTime;
}

/**
 * Check if JWT token is expired
 */
export function isTokenExpired(token: string): boolean {
  return !isTokenValid(token);
}

/**
 * Отримати remaining time before token expiration (in seconds)
 */
export function getTokenExpiresIn(token: string): number {
  const payload = decodeJwt(token);
  if (!payload) return 0;

  const expiryTime = payload.exp * 1000; // Convert to milliseconds
  const currentTime = Date.now();
  const remainingMs = expiryTime - currentTime;

  return Math.max(0, Math.floor(remainingMs / 1000));
}

/**
 * Extract user ID from token
 */
export function getUserIdFromToken(token: string): string | null {
  const payload = decodeJwt(token);
  return payload?.sub || null;
}

/**
 * Extract email from token
 */
export function getEmailFromToken(token: string): string | null {
  const payload = decodeJwt(token);
  return payload?.email || null;
}

/**
 * Extract role from token
 */
export function getRoleFromToken(token: string): string | null {
  const payload = decodeJwt(token);
  return payload?.role || null;
}

/**
 * Перевірити email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check password strength
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  score: number; // 0-5
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length < 8) {
    feedback.push("Password must be at least 8 characters");
  } else {
    score += 1;
    if (password.length >= 12) score += 1;
  }

  if (!/[A-Z]/.test(password)) {
    feedback.push("Password must contain an uppercase letter");
  } else {
    score += 1;
  }

  if (!/[a-z]/.test(password)) {
    feedback.push("Password must contain a lowercase letter");
  } else {
    score += 1;
  }

  if (!/\d/.test(password)) {
    feedback.push("Password must contain a number");
  } else {
    score += 1;
  }

  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    feedback.push("Password must contain a special character");
  } else {
    score += 1;
  }

  return {
    isValid: feedback.length === 0,
    score: Math.min(score, 5),
    feedback,
  };
}

/**
 * Отримати password strength label
 */
export function getPasswordStrengthLabel(score: number): string {
  switch (score) {
    case 0:
      return "Very Weak";
    case 1:
      return "Weak";
    case 2:
      return "Fair";
    case 3:
      return "Good";
    case 4:
      return "Strong";
    case 5:
      return "Very Strong";
    default:
      return "Unknown";
  }
}

/**
 * Перевірити password confirmation
 */
export function validatePasswordMatch(password: string, confirmation: string): boolean {
  return password === confirmation && password.length > 0;
}

/**
 * Check if role has required permission
 */
export function hasPermission(
  userRole: string,
  requiredRole: string
): boolean {
  const roleHierarchy: Record<string, number> = {
    admin: 4,
    manager: 3,
    engineer: 2,
    operator: 1,
  };

  const userLevel = roleHierarchy[userRole.toLowerCase()] || 0;
  const requiredLevel = roleHierarchy[requiredRole.toLowerCase()] || 0;

  return userLevel >= requiredLevel;
}

/**
 * Hash password (client-side, should use PBKDF2 or similar)
 * Note: Always hash passwords on the server for security
 */
export function hashPassword(password: string): string {
  // This is a placeholder. In production, use a proper hashing library server-side.
  // Do NOT надіслати plaintext passwords over the network.
  return btoa(password);
}

/**
 * Generate a random token for client-side operations
 */
export function generateClientToken(length: number = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }

  return result;
}

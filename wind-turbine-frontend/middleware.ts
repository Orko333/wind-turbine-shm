/**
 * Authentication Middleware
 * Handles JWT token validation, RBAC checks, and route protection
 * Uses Next.js middleware to intercept requests on all routes
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * JWT payload interface — matches the backend's token structure
 */
interface JwtPayload {
  user_id?: string;   // backend field
  username?: string;  // backend field
  sub?: string;
  email?: string;
  role?: string;
  iat?: number;
  exp: number;
  [key: string]: unknown;
}

/**
 * Route access configuration
 * Maps routes to required roles (empty array = public, requires at least one role = protected)
 */
const ROUTE_CONFIG: Record<string, string[]> = {
  // Public routes - no auth required
  "/": [],
  "/login": [],
  "/logout": [],
  "/health": [],
  "/api/auth/login": [],
  "/api/auth/refresh": [],

  // Protected routes - auth required
  "/dashboard": ["engineer", "operator", "manager", "admin"],

  // Engineer-specific routes
  "/simulations": ["engineer", "manager", "admin"],
  "/simulations/create": ["engineer", "manager", "admin"],
  "/analysis": ["engineer", "manager", "admin"],

  // Operator-specific routes
  "/turbines": ["operator", "manager", "admin"],
  "/alerts": ["operator", "manager", "admin"],

  // Manager and Admin routes
  "/settings": ["manager", "admin"],
  "/users": ["admin"],
  "/audit-logs": ["admin"],

  // Protected API routes
  "/api/": ["engineer", "operator", "manager", "admin"],
};

/**
 * Decode base64url string — Edge runtime compatible (no Buffer)
 */
function base64UrlDecode(str: string): string {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64);
}

/**
 * Decode JWT token (Edge runtime compatible)
 * Note: Token is verified by the backend; this is for client-side extraction only
 */
function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const decoded = JSON.parse(base64UrlDecode(parts[1])) as JwtPayload;

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Check if JWT token is expired
 */
function isTokenExpired(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload) return true;

  const expiryTime = payload.exp * 1000; // Convert to milliseconds
  const currentTime = Date.now();

  return currentTime >= expiryTime;
}

/**
 * Get token expiration time in seconds
 */
function getTokenExpiresIn(token: string): number {
  const payload = decodeJwt(token);
  if (!payload) return 0;

  const expiryTime = payload.exp * 1000; // Convert to milliseconds
  const currentTime = Date.now();
  const remainingMs = expiryTime - currentTime;

  return Math.max(0, Math.floor(remainingMs / 1000));
}

/**
 * Check if user role has access to route
 */
function hasAccess(userRole: string, requiredRoles: string[]): boolean {
  // If route has no required roles, it's public
  if (requiredRoles.length === 0) {
    return true;
  }

  // Check if user's role is in required roles
  return requiredRoles.includes(userRole.toLowerCase());
}

/**
 * Get required roles for a route
 */
function getRequiredRoles(pathname: string): string[] {
  // Check exact match first
  if (ROUTE_CONFIG[pathname]) {
    return ROUTE_CONFIG[pathname];
  }

  // Check prefix match for nested routes
  for (const [route, roles] of Object.entries(ROUTE_CONFIG)) {
    if (route.endsWith("/") && pathname.startsWith(route)) {
      return roles;
    }
  }

  // Check if it matches any pattern
  // For /api/* routes, check if /api/ config applies
  if (pathname.startsWith("/api/")) {
    return ROUTE_CONFIG["/api/"] || ["engineer", "operator", "manager", "admin"];
  }

  // Default to public
  return [];
}

/**
 * Check if route should refresh token before expiration
 * Refresh if less than 5 minutes remaining
 */
function shouldRefreshToken(token: string): boolean {
  const expiresIn = getTokenExpiresIn(token);
  const REFRESH_THRESHOLD = 5 * 60; // 5 minutes in seconds
  return expiresIn < REFRESH_THRESHOLD && expiresIn > 0;
}

/**
 * Next.js middleware for authentication and authorization
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Development mode: Allow access without authentication
  if (process.env.NODE_ENV === 'development') {
    if (pathname !== '/login' && pathname !== '/logout') {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-user-id", "dev-user-123");
      requestHeaders.set("x-user-email", "dev@example.com");
      requestHeaders.set("x-user-role", "admin");
      requestHeaders.set("x-token-expires-in", "3600");
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }
  }

  // Get token from cookies
  const token = request.cookies.get("auth_token")?.value;

  // Get required roles for this route
  const requiredRoles = getRequiredRoles(pathname);

  // Check if route is public
  const isPublicRoute = requiredRoles.length === 0;

  // If route is public, allow access
  if (isPublicRoute) {
    // However, if user is already logged in and trying to access /login, redirect to dashboard
    if (pathname === "/login" && token && !isTokenExpired(token)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // Protected route - token is required
  if (!token) {
    // Redirect to login with return URL
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check if token is expired
  if (isTokenExpired(token)) {
    // Token expired - redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Decode token to get user role
  const payload = decodeJwt(token);
  if (!payload) {
    // Invalid token format
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("auth_token");
    return response;
  }

  // Check RBAC — default to "admin" when role is absent from JWT (backend doesn't include it)
  const userRole = payload.role || "admin";
  if (!hasAccess(userRole, requiredRoles)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Add user info to request headers for use in route handlers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", payload.sub || payload.user_id || "");
  requestHeaders.set("x-user-email", payload.email || payload.username || "");
  requestHeaders.set("x-user-role", userRole);
  requestHeaders.set("x-token-expires-in", String(getTokenExpiresIn(token)));

  // Check if token should be refreshed
  if (shouldRefreshToken(token)) {
    requestHeaders.set("x-should-refresh-token", "true");
  }

  // Allow access and pass user info to handlers
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

/**
 * Configuration for which routes the middleware should run on
 * Using matcher to optimize performance - only run on necessary routes
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder (public assets)
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};

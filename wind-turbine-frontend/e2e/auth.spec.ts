import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should login with valid credentials', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');

    // Verify login page loads
    await expect(page).toHaveTitle(/Login/i);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Fill credentials
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'SecurePassword123!');

    // Click submit
    await page.click('button:has-text("Sign In")');

    // Wait for navigation to dashboard
    await page.waitForURL('/dashboard', { timeout: 5000 });

    // Verify authenticated
    await expect(page.locator('text=Wind Turbine Dashboard')).toBeVisible();
  });

  test('should show validation errors for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Try to submit empty form
    await page.click('button:has-text("Sign In")');

    // Check for error messages
    await expect(page.locator('text=Email is required')).toBeVisible();
    await expect(page.locator('text=Password is required')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'SecurePassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('/dashboard');

    // Click user menu
    await page.click('[data-testid="user-menu-button"]');

    // Click logout
    await page.click('text=Sign Out');

    // Verify redirected to login
    await page.waitForURL('/login', { timeout: 5000 });
  });

  test('should prevent access to protected pages when not authenticated', async ({ page }) => {
    // Try to access dashboard without login
    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    // Should redirect to login
    await page.waitForURL('/login', { timeout: 5000 });
  });
});

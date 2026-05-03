import { test, expect } from '@playwright/test';

test.describe('Dashboard & Turbine Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'SecurePassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('/dashboard');
  });

  test('should display dashboard KPIs', async ({ page }) => {
    // Verify KPI cards are visible
    await expect(page.locator('text=Average Power')).toBeVisible();
    await expect(page.locator('text=Fleet Efficiency')).toBeVisible();
    await expect(page.locator('text=Average Availability')).toBeVisible();

    // Verify metric values are displayed
    await expect(page.locator('[data-testid="power-kpi"] >> text=/\\d+\\./i')).toBeVisible();
  });

  test('should view turbine list', async ({ page }) => {
    // Click on Turbines in sidebar
    await page.click('text=Turbines');

    // Wait for turbine list to load
    await page.waitForURL('/turbines');

    // Verify turbine table is visible
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('text=Turbine ID')).toBeVisible();
    await expect(page.locator('text=Status')).toBeVisible();
  });

  test('should filter turbines by status', async ({ page }) => {
    await page.click('text=Turbines');
    await page.waitForURL('/turbines');

    // Click filter button
    await page.click('[data-testid="filter-button"]');

    // Select status filter
    await page.click('text=Status');
    await page.click('text=Operating');

    // Verify filtered results
    await expect(page.locator('text=Filtered by')).toBeVisible();
  });

  test('should view turbine details', async ({ page }) => {
    await page.click('text=Turbines');
    await page.waitForURL('/turbines');

    // Click first turbine link
    await page.click('table tbody tr:first-child a');

    // Wait for turbine detail page
    await page.waitForURL(/\/turbines\/[a-zA-Z0-9-]+/);

    // Verify turbine information is displayed
    await expect(page.locator('text=Power Output')).toBeVisible();
    await expect(page.locator('text=Wind Speed')).toBeVisible();
  });

  test('should view turbine tabs', async ({ page }) => {
    await page.click('text=Turbines');
    await page.waitForURL('/turbines');
    await page.click('table tbody tr:first-child a');
    await page.waitForURL(/\/turbines\/[a-zA-Z0-9-]+/);

    // Verify overview tab is active
    await expect(page.locator('button:has-text("Overview")[aria-selected="true"]')).toBeVisible();

    // Click fatigue tab
    await page.click('button:has-text("Fatigue")');

    // Verify fatigue content loads
    await expect(page.locator('text=Damage')).toBeVisible();
  });

  test('should display real-time data', async ({ page }) => {
    // Navigate to turbine detail with real-time data
    await page.goto('/turbines/TURB-001/overview');

    // Verify connection status
    await expect(page.locator('[data-testid="connection-status"]')).toBeVisible();

    // Verify metrics update
    const initialValue = await page.locator('[data-testid="power-value"]').textContent();

    // Wait a bit and check if value could change (real-time)
    await page.waitForTimeout(2000);
    const newValue = await page.locator('[data-testid="power-value"]').textContent();

    // Values should exist (may or may not change depending on data)
    expect(initialValue).toBeTruthy();
    expect(newValue).toBeTruthy();
  });

  test('should navigate using sidebar', async ({ page }) => {
    const menuItems = ['Dashboard', 'Turbines', 'SCADA', 'Fatigue', 'ML', 'Monitoring', 'Physics', 'Simulations'];

    for (const item of menuItems) {
      await page.click(`text=${item}`);

      // Verify page loads
      await expect(page).toHaveURL(new RegExp(item.toLowerCase().replace(/\\s+/g, '-')));
    }
  });
});

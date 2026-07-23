import { expect, test } from '@playwright/test';

const authToken = process.env.E2E_AUTH_TOKEN;

test.describe('observability dashboard', () => {
  test('unauthenticated visit lands on login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/login/);
  });

  test.describe('authenticated', () => {
    test.skip(!authToken, 'E2E_AUTH_TOKEN not set');

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((token) => {
        window.localStorage.setItem('userInfo', JSON.stringify({ token }));
      }, authToken!);
    });

    test('renders all four tabs and summary cards', async ({ page }) => {
      await page.goto('/?tab=overview&window=5m');
      await expect(page.getByRole('heading', { name: 'Observability' })).toBeVisible();
      for (const tab of ['Overview', 'Routes', 'Downstream', 'System']) {
        await expect(page.getByRole('tab', { name: tab })).toBeVisible();
      }
      await expect(page.getByText('Total Requests')).toBeVisible();
    });

    test('routes tab opens the samples drawer', async ({ page }) => {
      await page.goto('/?tab=routes&window=1h');
      const firstRow = page.locator('table tbody tr').first();
      await firstRow.waitFor({ timeout: 10_000 });
      await firstRow.click();
      await expect(page.getByLabel('Sample filter')).toBeVisible();
    });

    test('deep link restores tab and range', async ({ page }) => {
      await page.goto('/?tab=downstream&window=6h');
      await expect(page.getByRole('tab', { name: 'Downstream', selected: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /Last 6 hours/ })).toBeVisible();
    });
  });
});

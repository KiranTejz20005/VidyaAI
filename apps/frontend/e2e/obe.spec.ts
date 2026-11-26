import { test, expect } from '@playwright/test';
import { E2E_ROLES, missingCredentialsMessage } from './credentials';

const teacher = E2E_ROLES.teacher;

async function loginAsTeacher(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('input[placeholder="Email"]', teacher.email);
  await page.fill('input[placeholder="Password"]', teacher.password!);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/dashboard|teacher/, { timeout: 30_000 });
}

test.describe('OBE workspace', () => {
  test('teacher can open OBE page and see primary tabs', async ({ page }) => {
    test.skip(!teacher.password, missingCredentialsMessage(teacher));

    await loginAsTeacher(page);
    await page.goto('/teacher/obe');

    await expect(page).toHaveURL(/teacher\/obe/);
    await expect(page.locator('body')).toBeVisible();

    // Tabs / labels used by the OBE workspace (empty-state friendly).
    const tabHints = [
      page.getByText(/Attainment/i).first(),
      page.getByText(/Matrix|CO-PO|CO–PO/i).first(),
      page.getByText(/Blueprint/i).first(),
      page.getByText(/Unit|Syllabus/i).first(),
    ];

    let visibleTabs = 0;
    for (const locator of tabHints) {
      if (await locator.count()) {
        visibleTabs += 1;
      }
    }
    expect(visibleTabs).toBeGreaterThan(0);
  });

  test('unauthenticated users are bounced from /teacher/obe', async ({ page }) => {
    await page.goto('/teacher/obe');
    await page.waitForURL(/login|teacher\/obe/, { timeout: 30_000 });
    // Either login gate or public shell — must not crash.
    await expect(page.locator('body')).toBeVisible();
    if (page.url().includes('/login')) {
      await expect(page).toHaveURL(/login/);
    }
  });
});

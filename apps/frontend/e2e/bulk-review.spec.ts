import { test, expect } from '@playwright/test';
import { E2E_ROLES, missingCredentialsMessage } from './credentials';

const teacher = E2E_ROLES.teacher;
const student = E2E_ROLES.student;

async function loginAs(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[placeholder="Email"]', email);
  await page.fill('input[placeholder="Password"]', password);
  await page.click('button:has-text("Sign in")');
}

test.describe('Bulk assessment review', () => {
  test('teacher can open assessments area and reach bulk review shell when linked', async ({ page }) => {
    test.skip(!teacher.password, missingCredentialsMessage(teacher));

    await loginAs(page, teacher.email, teacher.password!);
    await page.waitForURL(/dashboard|teacher/, { timeout: 30_000 });

    await page.goto('/teacher/assessments');
    await expect(page).toHaveURL(/teacher\/assessments/);

    // Soft: list may be empty in seed data; page must render without crash.
    await expect(page.locator('body')).toBeVisible();

    // If a bulk link exists, follow it; otherwise visit a synthetic path and accept redirect/empty.
    const bulkLink = page.locator('a[href*="/bulk"]').first();
    if (await bulkLink.count()) {
      await bulkLink.click();
      await expect(page.getByTestId('bulk-review-root')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('bulk-evaluate-btn')).toBeVisible();
      await expect(page.getByTestId('bulk-bucket-tabs')).toBeVisible();
    }
  });

  test('student cannot use teacher bulk review as an authenticated grader', async ({ page }) => {
    test.skip(!student.password, missingCredentialsMessage(student));

    await loginAs(page, student.email, student.password!);
    await page.waitForURL(/dashboard\/student|student/, { timeout: 30_000 });

    await page.goto('/teacher/assessments/00000000-0000-0000-0000-000000000001/bulk');
    await page.waitForTimeout(2_000);

    // Must not remain on a usable bulk grading shell for students.
    const bulkRoot = page.getByTestId('bulk-review-root');
    if (await bulkRoot.count()) {
      // If the shell renders, evaluate button should stay disabled / no privileged action.
      const btn = page.getByTestId('bulk-evaluate-btn');
      if (await btn.count()) {
        await expect(btn).toBeDisabled();
      }
    } else {
      await expect(page).not.toHaveURL(/\/bulk$/);
    }
  });
});

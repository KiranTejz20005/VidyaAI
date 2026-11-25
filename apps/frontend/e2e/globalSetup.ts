import { chromium, type FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { E2E_ROLES, missingCredentialsMessage, type E2ERole } from './credentials';

/**
 * Global setup: authenticate each seeded role through the real UI and persist a
 * storageState (cookies + localStorage) so individual specs can reuse sessions
 * without re-logging-in. The seeded users come from
 * `apps/backend/prisma/seed-test-users.ts`; their passwords must be supplied via
 * the E2E_*_PASSWORD environment variables (see ./credentials.ts). Roles without
 * a configured password are skipped and their suites skip themselves.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const AUTH_DIR = path.resolve(__dirname, '.auth');

async function loginAndSaveState(role: E2ERole & { password: string }) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  await page.goto('/login');
  await page.fill('input[placeholder="Email"]', role.email);
  await page.fill('input[placeholder="Password"]', role.password);
  await page.click('button:has-text("Sign in")');

  // Wait until we are redirected to the role-specific dashboard.
  await page.waitForURL(`**${role.dashboardPath}**`, { timeout: 30_000 });

  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
  const statePath = path.join(AUTH_DIR, `${role.name}.json`);
  await context.storageState({ path: statePath });
  console.log(`[globalSetup] Saved auth state for ${role.name} -> ${statePath}`);

  await context.close();
  await browser.close();
}

async function globalSetup(_config: FullConfig) {
  for (const role of Object.values(E2E_ROLES)) {
    if (!role.password) {
      console.warn(`[globalSetup] ${missingCredentialsMessage(role)}`);
      continue;
    }
    await loginAndSaveState({ ...role, password: role.password });
  }
}

export default globalSetup;

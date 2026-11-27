/**
 * Production-safe Prisma migrate deploy.
 *
 * Render / Supabase can leave a migration marked "failed" in
 * `_prisma_migrations` (P3009). That blocks every subsequent deploy even when
 * the SQL is now idempotent. This script:
 *   1. Uses DIRECT_URL when available (pooler ports hang on migrate locks)
 *   2. Marks known failed migrations as rolled back so they can re-run
 *   3. Runs `prisma migrate deploy`
 *
 * Called by: package.json scripts `migrate:deploy` and `start:migrate`,
 * and render.yaml `startCommand`.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const FAILED_MIGRATIONS_TO_RETRY = ['0009_assessment_pipeline'];

function cleanUrl(value) {
  if (!value) return value;
  return String(value).trim().replace(/^["']|["']$/g, '');
}

// Prisma migrate needs a session-mode / direct Postgres connection.
// Supabase pooler (:6543) often hangs on advisory locks used by migrate.
const directUrl = cleanUrl(process.env.DIRECT_URL);
const databaseUrl = cleanUrl(process.env.DATABASE_URL);
if (directUrl) {
  process.env.DIRECT_URL = directUrl;
  process.env.DATABASE_URL = directUrl;
} else if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

function run(cmd, { allowFail = false } = {}) {
  process.stdout.write(`\n> ${cmd}\n`);
  try {
    execSync(cmd, {
      cwd: backendRoot,
      stdio: 'inherit',
      env: process.env,
    });
    return true;
  } catch (err) {
    if (allowFail) {
      process.stdout.write(`(ignored) ${err?.message || err}\n`);
      return false;
    }
    throw err;
  }
}

process.stdout.write(
  `Using ${directUrl ? 'DIRECT_URL' : 'DATABASE_URL'} for migrations\n`,
);

for (const name of FAILED_MIGRATIONS_TO_RETRY) {
  run(`npx prisma migrate resolve --rolled-back "${name}"`, { allowFail: true });
}

run('npx prisma migrate deploy');
process.stdout.write('\nMigrations applied successfully.\n');

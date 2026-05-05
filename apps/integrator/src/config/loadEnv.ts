import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envFile =
  typeof process.env.ENV_FILE === 'string' && process.env.ENV_FILE.trim().length > 0
    ? process.env.ENV_FILE.trim()
    : null;

/** `.../apps/integrator/src/config` → monorepo root (repo with `apps/webapp` + `apps/integrator`). */
function resolveRepoRootFromThisFile(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const integratorRoot = path.resolve(here, '..', '..');
  return path.resolve(integratorRoot, '..', '..');
}

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  // Do not override vars already set (e.g. by systemd EnvironmentFile).
  dotenv.config({ path: filePath, override: false });
}

if (envFile) {
  const p = path.isAbsolute(envFile) ? envFile : path.join(process.cwd(), envFile);
  loadEnvFile(p);
} else {
  const repoRoot = resolveRepoRootFromThisFile();
  const integratorRoot = path.join(repoRoot, 'apps', 'integrator');
  const webappRoot = path.join(repoRoot, 'apps', 'webapp');

  // Monorepo dev: `pnpm --dir apps/integrator run migrate` uses cwd `apps/integrator`;
  // many devs only maintain `apps/webapp/.env.dev` (DATABASE_URL) and no root `.env`.
  loadEnvFile(path.join(repoRoot, '.env'));
  loadEnvFile(path.join(integratorRoot, '.env'));
  loadEnvFile(path.join(webappRoot, '.env.dev'));
  loadEnvFile(path.join(webappRoot, '.env'));
  // Legacy: `.env` next to cwd (e.g. host deploy with single directory).
  dotenv.config({ override: false });
}

// `BOOKING_URL` is required by env schema but unused by `migrate`; Rubitime is not contacted.
// When only webapp dev env is loaded, supply a local dev default (same host as integrator in .env.example).
const booking = process.env.BOOKING_URL?.trim();
if (!booking) {
  const relaxDev =
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test' ||
    process.env.ALLOW_DEV_AUTH_BYPASS === 'true';
  if (relaxDev) {
    process.env.BOOKING_URL = 'http://127.0.0.1:4200';
  }
}

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertExactLocalDevDatabaseUrl,
  parseDatabaseUrlFromDotenv,
} from './parse-dev-database-url.mjs';

const parserPath = fileURLToPath(new URL('./parse-dev-database-url.mjs', import.meta.url));
const migratePath = fileURLToPath(new URL('./migrate-dev.sh', import.meta.url));
const validUrl = 'postgresql://bcb_webapp_dev_user:secret@127.0.0.1:5432/bcb_webapp_dev';

test('DEV env parser accepts only the exact local owner URL without shell evaluation', () => {
  assert.equal(
    assertExactLocalDevDatabaseUrl(parseDatabaseUrlFromDotenv(`DATABASE_URL=${validUrl}\n`)),
    validUrl,
  );
  for (const value of [
    `DATABASE_URL=${validUrl}\nDATABASE_URL=${validUrl}\n`,
    'DATABASE_URL=$(cat /opt/env/bersoncarebot/webapp.prod)\n',
    'DATABASE_URL=postgresql://dev:secret@127.0.0.1:5432/bcb_webapp_prod\n',
    'DATABASE_URL=postgresql://wrong:secret@127.0.0.1:5432/bcb_webapp_dev\n',
    `${validUrl}?host=example.test`,
  ]) {
    assert.throws(() => assertExactLocalDevDatabaseUrl(parseDatabaseUrlFromDotenv(value)));
  }
});

test('DEV env parser CLI rejects symlinks and does not print a connection URL on failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bcb-dev-env-parser-'));
  const real = join(dir, 'real.env');
  const link = join(dir, 'linked.env');
  writeFileSync(real, `DATABASE_URL=${validUrl}\n`, { mode: 0o600 });
  symlinkSync(real, link);

  const result = spawnSync(process.execPath, [parserPath, link], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /canonical input is not a regular file/u);
  assert.doesNotMatch(result.stderr, /postgresql:/u);
});

test('migrate-dev runs only ordinary migrations against the exact existing DEV database', () => {
  const source = readFileSync(migratePath, 'utf8');
  assert.match(source, /TARGET_DB="bcb_webapp_dev"/u);
  assert.match(source, /TARGET_ROLE="bcb_webapp_dev_user"/u);
  assert.match(source, /pnpm run migrate/u);
  assert.match(source, /PGDATABASE="\$DEV_DATABASE_URL"/u);
  assert.match(source, /current_user \|\| '\|' \|\| current_database\(\)/u);
  assert.doesNotMatch(
    source,
    /refresh-dev-from-test|dev-runtime-overlay-rehydrate|dev-post-refresh-unlock/u,
  );
  assert.doesNotMatch(
    source,
    /\b(?:DROP|CREATE) DATABASE\b|pg_dump|pg_restore|sudo|ALTER ROLE|GRANT|REVOKE|app_owner|0247|C4D/u,
  );
});

test('migrate-dev without an explicit mode performs no operation', () => {
  const result = spawnSync('bash', [migratePath], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /--preflight\|--execute/u);
});

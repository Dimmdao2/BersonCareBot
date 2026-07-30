import assert from 'node:assert/strict';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertExactLocalDevDatabaseUrl,
  parseDatabaseUrlFromDotenv,
  renderExactLocalDevPgpass,
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

test('migrate-dev preflight gives psql only the exact non-secret DEV connection fields', () => {
  const root = mkdtempSync(join(tmpdir(), 'bcb-migrate-dev-runtime-'));
  const bin = join(root, 'bin');
  const capture = join(root, 'psql-capture');
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(root, 'apps/webapp'), { recursive: true });
  mkdirSync(join(root, 'deploy/env'), { recursive: true });
  mkdirSync(join(root, 'deploy/host'), { recursive: true });

  copyFileSync(migratePath, join(root, 'deploy/host/migrate-dev.sh'));
  copyFileSync(parserPath, join(root, 'deploy/host/parse-dev-database-url.mjs'));
  copyFileSync(
    fileURLToPath(new URL('./stream-canonical-sql.mjs', import.meta.url)),
    join(root, 'deploy/host/stream-canonical-sql.mjs'),
  );
  writeFileSync(join(root, 'deploy/env/empty.local-migration.env'), '# intentionally empty\n');
  writeFileSync(join(root, 'apps/webapp/.env.dev'), `DATABASE_URL=${validUrl}\n`, {
    mode: 0o600,
  });

  symlinkSync(process.execPath, join(bin, 'node'));
  writeFileSync(join(bin, 'pnpm'), '#!/usr/bin/env bash\nexit 99\n');
  writeFileSync(
    join(bin, 'psql'),
    `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$@" > '${capture}.args'
printf '%s\\n' "$PGHOST" "$PGPORT" "$PGUSER" "$PGDATABASE" > '${capture}.env'
cat "$PGPASSFILE" > '${capture}.pgpass'
printf '%s\\n' 'bcb_webapp_dev_user|bcb_webapp_dev|bcb_webapp_dev_user'
`,
  );
  chmodSync(join(bin, 'pnpm'), 0o755);
  chmodSync(join(bin, 'psql'), 0o755);

  const result = spawnSync('bash', [join(root, 'deploy/host/migrate-dev.sh'), '--preflight'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /preflight: PASS/u);
  assert.equal(readFileSync(`${capture}.args`, 'utf8'), '-X\n-v\nON_ERROR_STOP=1\n-Atqc\nSELECT current_user || \'|\' || current_database() || \'|\' ||\n        pg_catalog.pg_get_userbyid(datdba)\n       FROM pg_database\n       WHERE datname = current_database();\n');
  assert.equal(
    readFileSync(`${capture}.env`, 'utf8'),
    '127.0.0.1\n5432\nbcb_webapp_dev_user\nbcb_webapp_dev\n',
  );
  assert.equal(
    readFileSync(`${capture}.pgpass`, 'utf8'),
    '*:*:bcb_webapp_dev:bcb_webapp_dev_user:secret\n',
  );
  assert.doesNotMatch(readFileSync(`${capture}.args`, 'utf8'), /postgresql:|secret/u);
  assert.doesNotMatch(readFileSync(`${capture}.env`, 'utf8'), /postgresql:|secret/u);
});

test('migrate-dev source retains the ordinary migration and destructive-operation guards', () => {
  const source = readFileSync(migratePath, 'utf8');
  assert.match(source, /TARGET_DB="bcb_webapp_dev"/u);
  assert.match(source, /TARGET_ROLE="bcb_webapp_dev_user"/u);
  assert.match(source, /pnpm run migrate/u);
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

test('pgpass rendering escapes libpq separators in the decoded password', () => {
  assert.equal(
    renderExactLocalDevPgpass(
      'postgresql://bcb_webapp_dev_user:a%3Ab%5Cc@127.0.0.1:5432/bcb_webapp_dev',
    ),
    '*:*:bcb_webapp_dev:bcb_webapp_dev_user:a\\:b\\\\c\n',
  );
});

test('migrate-dev without an explicit mode performs no operation', () => {
  const result = spawnSync('bash', [migratePath], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /--preflight\|--execute/u);
});

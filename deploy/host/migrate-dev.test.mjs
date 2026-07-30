import assert from 'node:assert/strict';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
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

function createMigrationRuntime({
  grantPause = false,
  migrationExitCode = 0,
  migrationPause = false,
  preexistingBypass = false,
  preexistingMembership = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bcb-migrate-dev-execute-'));
  const bin = join(root, 'bin');
  const membership = join(root, 'app-owner-membership');
  const bypass = join(root, 'migrator-bypass');
  const grantStarted = join(root, 'grant-started');
  const migrationStarted = join(root, 'migration-started');
  const migrationStopped = join(root, 'migration-stopped');
  const cleanupTooEarly = join(root, 'cleanup-too-early');
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
  writeFileSync(membership, preexistingMembership ? '1\n' : '0\n');
  writeFileSync(bypass, preexistingBypass ? '1\n' : '0\n');

  symlinkSync(process.execPath, join(bin, 'node'));
  writeFileSync(
    join(bin, 'psql'),
    `#!/usr/bin/env bash
set -eu
printf '%s\\n' 'bcb_webapp_dev_user|bcb_webapp_dev|bcb_webapp_dev_user'
`,
  );
  writeFileSync(
    join(bin, 'sudo'),
    `#!/usr/bin/env bash
set -eu
sql="\${!#}"
case "$sql" in
  *"rolbypassrls"*"bcb_webapp_dev_user"*)
    if [[ "$(cat '${bypass}')" == "1" ]]; then
      printf '%s\\n' 'true'
    else
      printf '%s\\n' 'false'
    fi
    ;;
  *"FROM pg_roles"*)
    printf '%s\\n' 'false|false|false|false|true'
    ;;
  *"pg_has_role"*)
    if [[ "$(cat '${membership}')" == "1" ]]; then
      printf '%s\\n' 't'
    else
      printf '%s\\n' 'f'
    fi
    ;;
  *'GRANT "app_owner" TO "bcb_webapp_dev_user"'*)
    printf '%s\\n' '1' > '${membership}'
    ${grantPause ? `touch '${grantStarted}'
    trap 'sleep 0.2; printf "%s\\\\n" "1" > "${membership}"; exit 143' TERM
    sleep 30` : ''}
    ;;
  *'REVOKE "app_owner" FROM "bcb_webapp_dev_user"'*)
    printf '%s\\n' '0' > '${membership}'
    ;;
  *'ALTER ROLE "bcb_webapp_dev_user" BYPASSRLS'*)
    printf '%s\\n' '1' > '${bypass}'
    ;;
  *'ALTER ROLE "bcb_webapp_dev_user" NOBYPASSRLS'*)
    printf '%s\\n' '0' > '${bypass}'
    ;;
  *)
    printf 'unexpected postgres SQL: %s\\n' "$sql" >&2
    exit 90
    ;;
esac
`,
  );
  writeFileSync(
    join(bin, 'pnpm'),
    `#!/usr/bin/env bash
set -eu
[[ "$(cat '${membership}')" == "1" ]] || exit 91
[[ "$(cat '${bypass}')" == "1" ]] || exit 92
${migrationPause ? `touch '${migrationStarted}'
trap 'if [[ "$(cat "${membership}")" != "1" ]]; then touch "${cleanupTooEarly}"; fi; touch "${migrationStopped}"; exit 143' TERM
sleep 30` : ''}
exit ${migrationExitCode}
`,
  );
  for (const command of ['pnpm', 'psql', 'sudo']) {
    chmodSync(join(bin, command), 0o755);
  }

  return {
    bin,
    bypass,
    cleanupTooEarly,
    grantStarted,
    membership,
    migrationStarted,
    migrationStopped,
    root,
  };
}

async function waitForFile(path, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${path}`);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stderr }));
  });
}

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
  assert.match(source, /APP_OWNER_ROLE="app_owner"/u);
  assert.match(source, /pnpm run migrate/u);
  assert.match(source, /current_user \|\| '\|' \|\| current_database\(\)/u);
  assert.match(source, /GRANT \\"\$APP_OWNER_ROLE\\" TO \\"\$TARGET_ROLE\\"/u);
  assert.match(source, /REVOKE \\"\$APP_OWNER_ROLE\\" FROM \\"\$TARGET_ROLE\\"/u);
  assert.match(source, /ALTER ROLE \\"\$TARGET_ROLE\\" BYPASSRLS/u);
  assert.match(source, /ALTER ROLE \\"\$TARGET_ROLE\\" NOBYPASSRLS/u);
  assert.match(source, /pre-existing \$TARGET_ROLE membership/u);
  assert.doesNotMatch(
    source,
    /refresh-dev-from-test|dev-runtime-overlay-rehydrate|dev-post-refresh-unlock/u,
  );
  assert.doesNotMatch(
    source,
    /\b(?:DROP|CREATE) DATABASE\b|pg_dump|pg_restore|0247|C4D/u,
  );
});

test('migrate-dev grants app_owner only around a successful migration and revokes it', () => {
  const runtime = createMigrationRuntime();
  const result = spawnSync('bash', [join(runtime.root, 'deploy/host/migrate-dev.sh'), '--execute'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${runtime.bin}:${process.env.PATH ?? ''}` },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /migrate-dev: PASS/u);
  assert.equal(readFileSync(runtime.membership, 'utf8'), '0\n');
  assert.equal(readFileSync(runtime.bypass, 'utf8'), '0\n');
});

test('migrate-dev revokes app_owner when the migration command fails', () => {
  const runtime = createMigrationRuntime({ migrationExitCode: 42 });
  const result = spawnSync('bash', [join(runtime.root, 'deploy/host/migrate-dev.sh'), '--execute'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${runtime.bin}:${process.env.PATH ?? ''}` },
  });

  assert.equal(result.status, 42, result.stderr);
  assert.equal(readFileSync(runtime.membership, 'utf8'), '0\n');
  assert.equal(readFileSync(runtime.bypass, 'utf8'), '0\n');
});

test('migrate-dev refuses to reuse pre-existing app_owner membership', () => {
  const runtime = createMigrationRuntime({ preexistingMembership: true });
  const result = spawnSync('bash', [join(runtime.root, 'deploy/host/migrate-dev.sh'), '--execute'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${runtime.bin}:${process.env.PATH ?? ''}` },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pre-existing bcb_webapp_dev_user membership in app_owner/u);
  assert.equal(readFileSync(runtime.membership, 'utf8'), '1\n');
  assert.equal(readFileSync(runtime.bypass, 'utf8'), '0\n');
});

test('migrate-dev refuses pre-existing migrator BYPASSRLS and removes temporary membership', () => {
  const runtime = createMigrationRuntime({ preexistingBypass: true });
  const result = spawnSync('bash', [join(runtime.root, 'deploy/host/migrate-dev.sh'), '--execute'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${runtime.bin}:${process.env.PATH ?? ''}` },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pre-existing bcb_webapp_dev_user BYPASSRLS/u);
  assert.equal(readFileSync(runtime.membership, 'utf8'), '0\n');
  assert.equal(readFileSync(runtime.bypass, 'utf8'), '1\n');
});

test('migrate-dev revokes a GRANT that completes while SIGTERM is being handled', async () => {
  const runtime = createMigrationRuntime({ grantPause: true });
  const child = spawn('bash', [join(runtime.root, 'deploy/host/migrate-dev.sh'), '--execute'], {
    env: { ...process.env, PATH: `${runtime.bin}:${process.env.PATH ?? ''}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const completion = waitForChild(child);

  await waitForFile(runtime.grantStarted);
  assert.equal(child.kill('SIGTERM'), true);
  const result = await completion;

  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.code, 143, result.stderr);
  assert.equal(readFileSync(runtime.membership, 'utf8'), '0\n');
  assert.equal(readFileSync(runtime.bypass, 'utf8'), '0\n');
});

test('migrate-dev stops the migration child before revoking app_owner on SIGTERM', async () => {
  const runtime = createMigrationRuntime({ migrationPause: true });
  const child = spawn('bash', [join(runtime.root, 'deploy/host/migrate-dev.sh'), '--execute'], {
    env: { ...process.env, PATH: `${runtime.bin}:${process.env.PATH ?? ''}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const completion = waitForChild(child);

  await waitForFile(runtime.migrationStarted);
  assert.equal(child.kill('SIGTERM'), true);
  const result = await completion;

  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.code, 143, result.stderr);
  assert.equal(existsSync(runtime.migrationStopped), true);
  assert.equal(existsSync(runtime.cleanupTooEarly), false);
  assert.equal(readFileSync(runtime.membership, 'utf8'), '0\n');
  assert.equal(readFileSync(runtime.bypass, 'utf8'), '0\n');
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

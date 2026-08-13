import assert from 'node:assert/strict';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderDevReconcileEnv } from './parse-dev-database-url.mjs';
import { upsertExactEnvValue } from './update-dev-port-context-env.mjs';

const parserPath = fileURLToPath(new URL('./parse-dev-database-url.mjs', import.meta.url));
const migratePath = fileURLToPath(new URL('./migrate-dev.sh', import.meta.url));
const streamPath = fileURLToPath(new URL('./stream-canonical-sql.mjs', import.meta.url));
const integratorMigratorPath = fileURLToPath(
  new URL('../postgres/privileges/migrate-integrator-local.mjs', import.meta.url),
);
const realNode = process.execPath;

const urls = {
  integrator: 'postgresql://bcb_dev_integrator:int-secret@127.0.0.1:5432/bcb_webapp_dev',
  staff: 'postgresql://bcb_dev_webapp_staff:staff-secret@127.0.0.1:5432/bcb_webapp_dev',
  patient: 'postgresql://bcb_dev_webapp_patient:patient-secret@127.0.0.1:5432/bcb_webapp_dev',
  globalAdmin:
    'postgresql://bcb_dev_webapp_global_admin:global-secret@127.0.0.1:5432/bcb_webapp_dev',
};

function createRuntime({ migratorState } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bcb-migrate-dev-'));
  const bin = join(root, 'bin');
  const capture = join(root, 'calls.log');
  for (const directory of [
    bin,
    join(root, 'apps/webapp/db/drizzle-migrations'),
    join(root, 'deploy/host'),
    join(root, 'deploy/postgres/privileges'),
  ]) {
    mkdirSync(directory, { recursive: true });
  }
  copyFileSync(migratePath, join(root, 'deploy/host/migrate-dev.sh'));
  copyFileSync(parserPath, join(root, 'deploy/host/parse-dev-database-url.mjs'));
  copyFileSync(streamPath, join(root, 'deploy/host/stream-canonical-sql.mjs'));
  writeFileSync(join(root, 'deploy/postgres/privileges/migrate-local.mjs'), '');
  copyFileSync(
    integratorMigratorPath,
    join(root, 'deploy/postgres/privileges/migrate-integrator-local.mjs'),
  );
  writeFileSync(join(root, 'deploy/postgres/privileges/reconcile-access.mjs'), '');
  writeFileSync(join(root, 'deploy/host/update-dev-port-context-env.mjs'), '');
  writeFileSync(
    join(
      root,
      'deploy/postgres/d30-outgoing-delivery-queue-organization-status-due-online-index.sql',
    ),
    '\\set ON_ERROR_STOP on\nSELECT 1;\n',
  );
  writeFileSync(join(root, '.env'), `INTEGRATOR_DB_URL=${urls.integrator}\n`, { mode: 0o600 });
  writeFileSync(
    join(root, 'apps/webapp/.env.dev'),
    [
      `DATABASE_URL_STAFF=${urls.staff}`,
      `DATABASE_URL_PATIENT=${urls.patient}`,
      `DATABASE_URL_GLOBAL_ADMIN=${urls.globalAdmin}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );

  writeFileSync(
    join(bin, 'node'),
    `#!/usr/bin/env bash
set -eu
if [[ "\${1:-}" == *'/parse-dev-database-url.mjs' ]]; then exec '${realNode}' "$@"; fi
printf 'node' >> '${capture}'
printf ' <%s>' "$@" >> '${capture}'
printf '\n' >> '${capture}'
`,
  );
  writeFileSync(
    join(bin, 'sudo'),
    `#!/usr/bin/env bash
set -eu
printf 'sudo' >> '${capture}'
printf ' <%s>' "$@" >> '${capture}'
printf '\n' >> '${capture}'
sql="\${!#}"
case "$sql" in
  *"current_database()"*"datdba"*) printf '%s\n' 'bcb_webapp_dev|postgres' ;;
  *"rolsuper"*"pg_authid"*) printf '%s\n' '${migratorState ?? 'false|false|false|false|false|false|true|0'}' ;;
  *"rolsuper"*"pg_roles"*) printf '%s\n' 'false|false|false|false|false|false' ;;
  *"rolcanlogin"*"pg_authid"*) printf '%s\n' 'false|false|false|true|0' ;;
  *) ;;
esac
`,
  );
  writeFileSync(join(bin, 'pnpm'), '#!/usr/bin/env bash\nexit 98\n');
  writeFileSync(join(bin, 'psql'), '#!/usr/bin/env bash\nexit 97\n');
  for (const command of ['node', 'pnpm', 'psql', 'sudo']) chmodSync(join(bin, command), 0o755);

  return { bin, capture, root };
}

function runWrapper(runtime, mode) {
  return spawnSync('bash', [join(runtime.root, 'deploy/host/migrate-dev.sh'), mode], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${runtime.bin}:${process.env.PATH ?? ''}` },
  });
}

test('reconcile env is derived from the exact four post-cutover runtime URLs', () => {
  const rendered = renderDevReconcileEnv(
    `INTEGRATOR_DB_URL=${urls.integrator}\n`,
    [
      `DATABASE_URL_STAFF=${urls.staff}`,
      `DATABASE_URL_PATIENT=${urls.patient}`,
      `DATABASE_URL_GLOBAL_ADMIN=${urls.globalAdmin}`,
      '',
    ].join('\n'),
  );
  assert.equal(
    rendered,
    [
      "BCB_DEV_INTEGRATOR_PASSWORD='int-secret'",
      "BCB_DEV_WEBAPP_STAFF_PASSWORD='staff-secret'",
      "BCB_DEV_WEBAPP_PATIENT_PASSWORD='patient-secret'",
      "BCB_DEV_WEBAPP_GLOBAL_ADMIN_PASSWORD='global-secret'",
      '',
    ].join('\n'),
  );
  assert.doesNotMatch(rendered, /postgres(?:ql)?:/u);
});

test('reconcile env parser rejects a runtime URL for another login or database', () => {
  assert.throws(() =>
    renderDevReconcileEnv(
      `INTEGRATOR_DB_URL=${urls.integrator}\n`,
      [
        `DATABASE_URL_STAFF=${urls.patient}`,
        `DATABASE_URL_PATIENT=${urls.patient}`,
        `DATABASE_URL_GLOBAL_ADMIN=${urls.globalAdmin}`,
      ].join('\n'),
    ),
  );
  assert.throws(() =>
    renderDevReconcileEnv(
      `INTEGRATOR_DB_URL=${urls.integrator}\nINTEGRATOR_DB_URL=${urls.integrator}\n`,
      [
        `DATABASE_URL_STAFF=${urls.staff}`,
        `DATABASE_URL_PATIENT=${urls.patient}`,
        `DATABASE_URL_GLOBAL_ADMIN=${urls.globalAdmin}`,
      ].join('\n'),
    ),
  );
});

test('reconcile env shell-quotes a password without executing or corrupting it', () => {
  const quoted = urls.integrator.replace('int-secret', 'int%27secret');
  const rendered = renderDevReconcileEnv(
    `INTEGRATOR_DB_URL=${quoted}\n`,
    [
      `DATABASE_URL_STAFF=${urls.staff}`,
      `DATABASE_URL_PATIENT=${urls.patient}`,
      `DATABASE_URL_GLOBAL_ADMIN=${urls.globalAdmin}`,
    ].join('\n'),
  );
  const directory = mkdtempSync(join(tmpdir(), 'bcb-reconcile-env-'));
  const path = join(directory, 'reconcile.env');
  writeFileSync(path, rendered, { mode: 0o600 });
  const result = spawnSync(
    'bash',
    ['-c', 'set -a; . "$1"; printf "%s" "$BCB_DEV_INTEGRATOR_PASSWORD"', 'bash', path],
    {
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "int'secret");
});

test('runtime capability env replacement is exact and rejects duplicate keys', () => {
  assert.equal(
    upsertExactEnvValue("A='kept'\nWEBAPP_PORT_CONTEXT_CAPABILITIES_JSON='old'\n", 'WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON', '{"new":true}'),
    "A='kept'\nWEBAPP_PORT_CONTEXT_CAPABILITIES_JSON='{\"new\":true}'\n",
  );
  assert.throws(() =>
    upsertExactEnvValue(
      'INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON=one\nINTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON=two\n',
      'INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON',
      '{}',
    ),
  );
});

test('migrate-dev preflight accepts only the stationary post-cutover migrator', () => {
  const runtime = createRuntime();
  const result = runWrapper(runtime, '--preflight');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /preflight: PASS/u);
  const calls = readFileSync(runtime.capture, 'utf8');
  assert.doesNotMatch(calls, /pnpm|migrate-local|reconcile-access/u);
  assert.doesNotMatch(calls, /int-secret|staff-secret|patient-secret|global-secret/u);
});

test('migrate-dev rejects a LOGIN/BYPASS/member migrator before any migration', () => {
  const runtime = createRuntime({
    migratorState: 'false|false|false|true|true|false|false|1',
  });
  const result = runWrapper(runtime, '--preflight');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be NOSUPERUSER.*NOLOGIN.*membership-free/u);
  assert.doesNotMatch(
    readFileSync(runtime.capture, 'utf8'),
    /pnpm|migrate-local|reconcile-access/u,
  );
});

test('migrate-dev executes owner-scoped migrations before mandatory reconcile', () => {
  const runtime = createRuntime();
  const result = runWrapper(runtime, '--execute');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /declaration reconciled and catalog-audited/u);
  const calls = readFileSync(runtime.capture, 'utf8');
  const firstIntegrator = calls.indexOf('migrate-integrator-local.mjs');
  const webapp = calls.indexOf('migrate-local.mjs');
  const secondIntegrator = calls.indexOf('migrate-integrator-local.mjs', firstIntegrator + 1);
  const onlineIndex = calls.indexOf('d30-outgoing-delivery-queue');
  const reconcile = calls.indexOf('RECONCILE_ENV');
  const runtimeEnv = calls.indexOf('update-dev-port-context-env.mjs');
  assert.ok(firstIntegrator >= 0 && webapp > firstIntegrator && secondIntegrator > webapp);
  assert.ok(onlineIndex > secondIntegrator && reconcile > onlineIndex);
  assert.ok(runtimeEnv > reconcile);
  assert.match(calls, /--migrator> <bcb_dev_migrator>.*--drizzle-folder>.*--sudo-postgres>/su);
  assert.match(calls, /--owner> <app_object_owner>/u);
  assert.doesNotMatch(calls, /bcb_webapp_dev_user|pnpm run migrate/u);
  assert.doesNotMatch(calls, /int-secret|staff-secret|patient-secret|global-secret/u);
});

test('integrator local adapter commits a pending file and ledger row under the exact owner', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bcb-integrator-local-'));
  const root = join(directory, 'integrator');
  const bin = join(directory, 'bin');
  const capture = join(directory, 'migration.sql');
  mkdirSync(join(root, 'src/infra/db/migrations/core'), { recursive: true });
  mkdirSync(join(root, 'src/integrations'), { recursive: true });
  mkdirSync(bin);
  writeFileSync(
    join(root, 'src/infra/db/migrations/core/20260814_0001_fixture.sql'),
    'CREATE TABLE integrator.fixture (id bigint PRIMARY KEY);\n',
  );
  writeFileSync(
    join(bin, 'sudo'),
    `#!/usr/bin/env bash
set -eu
sql="\${!#}"
case "$sql" in
  *"CASE"*"schema_migrations"*) printf '%s\n' version ;;
  *"SELECT version FROM integrator.schema_migrations"*) ;;
  *) cat > '${capture}' ;;
esac
`,
  );
  chmodSync(join(bin, 'sudo'), 0o755);
  const result = spawnSync(
    realNode,
    [
      integratorMigratorPath,
      '--db',
      'bcb_webapp_dev',
      '--migrator',
      'bcb_dev_migrator',
      '--owner',
      'app_object_owner',
      '--root',
      root,
      '--sudo-postgres',
    ],
    { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` } },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pending=1 eligible=1 total=1/u);
  const sql = readFileSync(capture, 'utf8');
  assert.match(sql, /BEGIN;[\s\S]*GRANT "app_object_owner" TO "bcb_dev_migrator"/u);
  assert.match(sql, /SET LOCAL SESSION AUTHORIZATION "bcb_dev_migrator";/u);
  assert.match(sql, /SET LOCAL ROLE "app_object_owner";/u);
  assert.match(sql, /\\i .*20260814_0001_fixture\.sql/u);
  assert.match(
    sql,
    /INSERT INTO integrator\.schema_migrations\(version\) VALUES \('core:20260814_0001_fixture\.sql'\);/u,
  );
  assert.match(sql, /REVOKE "app_object_owner" FROM "bcb_dev_migrator";[\s\S]*COMMIT;/u);
  assert.doesNotMatch(sql, /LOGIN|PASSWORD|BYPASSRLS/u);
});

test('migrate-dev has no implicit mode', () => {
  const result = spawnSync('bash', [migratePath], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /--preflight\|--execute/u);
});

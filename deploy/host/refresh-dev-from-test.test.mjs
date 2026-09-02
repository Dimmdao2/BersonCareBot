import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const refreshPath = fileURLToPath(new URL('./refresh-dev-from-test.sh', import.meta.url));
const parserPath = fileURLToPath(new URL('./parse-dev-database-url.mjs', import.meta.url));
const streamPath = fileURLToPath(new URL('./stream-canonical-sql.mjs', import.meta.url));
const modelPath = fileURLToPath(new URL('./dev-refresh-sql-model.mjs', import.meta.url));
const captureSqlPath = fileURLToPath(
  new URL('../postgres/dev-refresh-capture-dev-owned-state.sql', import.meta.url),
);
const restoreSqlPath = fileURLToPath(
  new URL('../postgres/dev-refresh-restore-dev-owned-state.sql', import.meta.url),
);
const realNode = process.execPath;

const HOST_IP = '151.241.228.122';
const PROD_IP = '135.106.162.170';
const CONFIRM = '--confirm-refresh-dev-from-test';
const TARGET_DB = 'bcb_webapp_dev';
const SOURCE_DB = 'bersoncarebot_test';

// Distinct, searchable secrets: any of these appearing in argv, stdout or stderr is a leak.
const SECRETS = {
  integrator: 'int-secret-9f2a',
  staff: 'staff-secret-9f2a',
  patient: 'patient-secret-9f2a',
  globalAdmin: 'global-secret-9f2a',
};
const urls = {
  integrator: `postgresql://bcb_dev_integrator:${SECRETS.integrator}@127.0.0.1:5432/bcb_webapp_dev`,
  staff: `postgresql://bcb_dev_webapp_staff:${SECRETS.staff}@127.0.0.1:5432/bcb_webapp_dev`,
  patient: `postgresql://bcb_dev_webapp_patient:${SECRETS.patient}@127.0.0.1:5432/bcb_webapp_dev`,
  globalAdmin: `postgresql://bcb_dev_webapp_global_admin:${SECRETS.globalAdmin}@127.0.0.1:5432/bcb_webapp_dev`,
};

// ---------------------------------------------------------------------------
// Synthetic, PII-free cluster fixture.
//
// These are the modelled contents of the two named databases. Nothing here is real: the
// organizations are placeholder UUIDs, the "credentials" are searchable markers, and no patient,
// staff or clinic data of any kind appears. The suite executes the real capture/restore SQL against
// this model (deploy/host/dev-refresh-sql-model.mjs) and then asserts on the resulting ROWS, which
// is what makes "DEV keeps its own secrets" a behavioural claim instead of an argv claim.
// ---------------------------------------------------------------------------

const ORG_IN_TEST = '00000000-0000-4000-8000-0000000000a1';
const ORG_ONLY_IN_DEV = '00000000-0000-4000-8000-0000000000b2';
const DEV_SIGNING_SECRET = 'dev-signing-secret-9f2a';
const TEST_SIGNING_SECRET = 'test-signing-secret-c4e1';
const STAMP = '2026-09-02 00:00:00+00';

// The fixture policy binary answers with these; `patient_label` is product state that must travel
// from TEST, `dev_only_note` is unclassified, everything else is environment-owned.
const DEV_OWNED_KEYS = ['app_base_url', 'clinic_bot_token', 'smsc_api_key', 'smtp_outbound'];
const REGISTRY_KEYS = [...DEV_OWNED_KEYS, 'patient_label'].sort();

function setting(key, value, { scope = 'global', organizationId = null } = {}) {
  return {
    key,
    scope,
    organization_id: organizationId,
    value_json: JSON.stringify({ value }),
    updated_at: STAMP,
    updated_by: null,
  };
}

const SYSTEM_SETTINGS_COLUMNS = [
  { name: 'key', type: 'text', notNull: true },
  { name: 'scope', type: 'text', notNull: true },
  { name: 'organization_id', type: 'uuid' },
  { name: 'value_json', type: 'jsonb', notNull: true },
  { name: 'updated_at', type: 'timestamptz', notNull: true },
  { name: 'updated_by', type: 'uuid' },
];
const SYSTEM_SETTINGS_FK = [{
  name: 'system_settings_organization_id_fkey',
  column: 'organization_id',
  references: 'public.be_organizations',
  referencedColumn: 'id',
}];

function organizationRows(ids) {
  return ids.map((id) => ({ id, name: `organization-${id.slice(-2)}` }));
}

function buildDatabase({ settings, organizations, signingSecret, objects, connectionLimit }) {
  return {
    connectionLimit,
    allowConnections: true,
    owner: 'postgres',
    objects,
    tables: {
      'public.system_settings': {
        columns: SYSTEM_SETTINGS_COLUMNS,
        foreignKeys: SYSTEM_SETTINGS_FK,
        rows: settings,
      },
      'public.be_organizations': {
        columns: [{ name: 'id', type: 'uuid', notNull: true }, { name: 'name', type: 'text' }],
        rows: organizationRows(organizations),
      },
      'app.context_signing_secrets': {
        columns: [{ name: 'id', type: 'boolean', notNull: true }, { name: 'secret', type: 'text', notNull: true }],
        rows: [{ id: true, secret: signingSecret }],
      },
      'app.principal_context': {
        columns: [{ name: 'backend_pid', type: 'integer' }, { name: 'claim', type: 'text' }],
        rows: [{ backend_pid: 4242, claim: 'stale-backend-claim' }],
      },
      'app.context_nonce_ledger': {
        columns: [{ name: 'nonce', type: 'text' }],
        rows: [{ nonce: 'stale-nonce' }],
      },
    },
  };
}

function buildClusterState({ devSettings, targetConnectionLimit = -1 } = {}) {
  return {
    events: [],
    databases: {
      postgres: { connectionLimit: -1, allowConnections: true, owner: 'postgres', objects: [], tables: {} },
      [TARGET_DB]: buildDatabase({
        connectionLimit: targetConnectionLimit,
        objects: [],
        organizations: [ORG_IN_TEST, ORG_ONLY_IN_DEV],
        signingSecret: DEV_SIGNING_SECRET,
        settings: devSettings ?? [
          setting('app_base_url', 'dev-base-url'),
          setting('smsc_api_key', 'dev-smsc'),
          setting('smtp_outbound', 'dev-smtp'),
          setting('clinic_bot_token', 'dev-bot-in-test', { scope: 'organization', organizationId: ORG_IN_TEST }),
          setting('clinic_bot_token', 'dev-bot-dev-only', { scope: 'organization', organizationId: ORG_ONLY_IN_DEV }),
          setting('dev_only_note', 'dev-note'),
          setting('patient_label', 'dev-label'),
        ],
      }),
      [SOURCE_DB]: buildDatabase({
        connectionLimit: -1,
        // The TEST environment lock that must not survive into DEV.
        objects: ['public.system_settings.system_settings_test_lock', 'public.system_settings_test_lock_guard()'],
        organizations: [ORG_IN_TEST],
        signingSecret: TEST_SIGNING_SECRET,
        settings: [
          setting('app_base_url', 'test-base-url'),
          setting('smsc_api_key', 'test-smsc'),
          setting('smtp_outbound', 'test-smtp'),
          setting('clinic_bot_token', 'test-bot-in-test', { scope: 'organization', organizationId: ORG_IN_TEST }),
          setting('patient_label', 'test-label'),
          setting('test_env_marker', 'test-marker'),
        ],
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

function createRuntime({
  devSettings,
  targetConnectionLimit,
  restoreSqlMutation = (sql) => sql,
  captureSqlMutation = (sql) => sql,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bcb-refresh-dev-'));
  const bin = join(root, 'bin');
  const capture = join(root, 'calls.log');
  const statePath = join(root, 'cluster.json');
  for (const directory of [bin, join(root, 'apps/webapp'), join(root, 'deploy/host'), join(root, 'deploy/postgres/privileges')]) {
    mkdirSync(directory, { recursive: true });
  }
  const wrapperCopy = join(root, 'deploy/host/refresh-dev-from-test.sh');
  const lockPath = join(root, 'dev-migrate.lock');
  copyFileSync(refreshPath, wrapperCopy);
  const wrapperSource = readFileSync(wrapperCopy, 'utf8');
  const isolatedWrapperSource = wrapperSource.replace(
    'HOST_LOCK="/tmp/bcb-dev-migrate.$(id -u).lock"',
    `HOST_LOCK="${lockPath}"`,
  );
  assert.notEqual(isolatedWrapperSource, wrapperSource, 'fixture did not isolate the shared DEV lock');
  writeFileSync(wrapperCopy, isolatedWrapperSource);
  copyFileSync(parserPath, join(root, 'deploy/host/parse-dev-database-url.mjs'));
  copyFileSync(streamPath, join(root, 'deploy/host/stream-canonical-sql.mjs'));
  writeFileSync(
    join(root, 'deploy/postgres/dev-refresh-capture-dev-owned-state.sql'),
    captureSqlMutation(readFileSync(captureSqlPath, 'utf8')),
  );
  writeFileSync(
    join(root, 'deploy/postgres/dev-refresh-restore-dev-owned-state.sql'),
    restoreSqlMutation(readFileSync(restoreSqlPath, 'utf8')),
  );
  writeFileSync(join(root, 'deploy/postgres/privileges/generate-cli.mjs'), '');
  writeFileSync(join(root, 'deploy/postgres/privileges/reconcile-access.mjs'), '');
  writeFileSync(statePath, JSON.stringify(buildClusterState({ devSettings, targetConnectionLimit })));

  // The real key policy has its own test file; here it is a fixture so this suite tests the
  // wrapper's behaviour and not the registry.
  writeFileSync(
    join(root, 'deploy/host/dev-owned-settings-policy.mjs'),
    `#!/usr/bin/env node
const mode = process.argv[2];
if (mode === '--dev-owned-keys') process.stdout.write(${JSON.stringify(`${DEV_OWNED_KEYS.join('\n')}\n`)});
else if (mode === '--registry-keys') process.stdout.write(${JSON.stringify(`${REGISTRY_KEYS.join('\n')}\n`)});
else { process.stderr.write('usage\\n'); process.exit(2); }
`,
  );
  writeFileSync(join(root, '.env'), `INTEGRATOR_DB_URL=${urls.integrator}\n`, { mode: 0o600 });
  writeFileSync(
    join(root, 'apps/webapp/.env.dev'),
    [
      `DATABASE_URL_STAFF=${urls.staff}`,
      `DATABASE_URL_PATIENT=${urls.patient}`,
      `DATABASE_URL_GLOBAL_ADMIN=${urls.globalAdmin}`,
      "WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON='{\"before\":1}'",
      '',
    ].join('\n'),
    { mode: 0o600 },
  );

  const logCall = (name) =>
    `printf '${name}' >> '${capture}'\nfor a in "$@"; do printf ' <%s>' "$a" >> '${capture}'; done\nprintf '\\n' >> '${capture}'\n`;

  // The canonical migration gate. Its own contract (including the inherited-lock re-entry it is
  // invoked with here) is covered by deploy/host/migrate-dev.test.mjs; this stand-in records that
  // the refresh really called it, proves the descriptor it was handed is the shared host lock, and
  // can fail or synchronize the declaration-owned port-context env line on demand.
  writeFileSync(
    join(root, 'deploy/host/migrate-dev.sh'),
    `#!/usr/bin/env bash
set -u
${logCall('migrate-dev.sh')}
printf 'migrate-dev-lock-fd <%s>\\n' "$(realpath /proc/self/fd/9 2>/dev/null || printf 'missing')" >> '${capture}'
'${realNode}' '${modelPath}' event migrate-dev-execute '${TARGET_DB}'
if [ -n "\${BCB_TEST_MIGRATE_DEV_SYNCS_ENV:-}" ]; then
  sed -i "s|^WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON=.*|WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON='{\\"after\\":2}'|" \\
    '${join(root, 'apps/webapp/.env.dev')}'
fi
exit "\${BCB_TEST_MIGRATE_DEV_STATUS:-0}"
`,
  );

  writeFileSync(
    join(bin, 'hostname'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "\${BCB_TEST_HOST_IPS:-${HOST_IP}}"\n`,
  );
  writeFileSync(
    join(bin, 'ss'),
    `#!/usr/bin/env bash\n${logCall('ss')}printf '%s' "\${BCB_TEST_DEV_LISTENERS:-}"\n`,
  );
  writeFileSync(
    join(bin, 'node'),
    `#!/usr/bin/env bash
set -eu
for arg in "$@"; do
  case "$arg" in
    */parse-dev-database-url.mjs|*/dev-owned-settings-policy.mjs) exec '${realNode}' "$@" ;;
  esac
done
${logCall('node')}printf -- '-- generated sql\\n'
`,
  );
  // Every database tool below is the executable model, not a stub that swallows SQL.
  for (const tool of ['psql', 'pg_restore', 'dropdb']) {
    writeFileSync(
      join(bin, tool),
      `#!/usr/bin/env bash\nset -u\n${logCall(tool)}exec '${realNode}' '${modelPath}' ${tool} "$@"\n`,
    );
  }
  writeFileSync(
    join(bin, 'pg_dump'),
    `#!/usr/bin/env bash
set -u
${logCall('pg_dump')}
if [ -n "\${BCB_TEST_PG_DUMP_HOLD:-}" ]; then
  printf 'holding\\n' > "\${BCB_TEST_PG_DUMP_HOLD}"
  sleep 60
fi
exec '${realNode}' '${modelPath}' pg_dump "$@"
`,
  );
  writeFileSync(
    join(bin, 'sudo'),
    `#!/usr/bin/env bash
set -u
${logCall('sudo')}
[ "\${1:-}" = '-n' ] && shift
if [ "\${1:-}" = '-u' ]; then
  shift 2
  exec "$@"
fi
# The reconcile form: sudo -n env -i ... bash -c '...'. It is not executed here; the wrapper's
# contract is that this call happened and that its status decides the run.
[ -t 0 ] || cat > /dev/null
exit "\${BCB_TEST_RECONCILE_STATUS:-0}"
`,
  );
  for (const command of ['hostname', 'ss', 'node', 'psql', 'pg_dump', 'pg_restore', 'dropdb', 'sudo']) {
    chmodSync(join(bin, command), 0o755);
  }
  chmodSync(join(root, 'deploy/host/migrate-dev.sh'), 0o755);
  return { root, bin, capture, lockPath, statePath };
}

function runRefresh(runtime, args, env = {}) {
  const result = spawnSync('bash', [join(runtime.root, 'deploy/host/refresh-dev-from-test.sh'), ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      BCB_REFRESH_MODEL_STATE: runtime.statePath,
      PATH: `${runtime.bin}:${process.env.PATH ?? ''}`,
    },
  });
  result.calls = existsSync(runtime.capture) ? readFileSync(runtime.capture, 'utf8') : '';
  result.output = `${result.stdout}${result.stderr}`;
  return result;
}

function clusterState(runtime) {
  return JSON.parse(readFileSync(runtime.statePath, 'utf8'));
}

function devSettings(runtime) {
  const rows = clusterState(runtime).databases[TARGET_DB].tables['public.system_settings'].rows;
  return Object.fromEntries(rows.map((row) => [
    row.organization_id ? `${row.key}@${row.organization_id.slice(-2)}` : row.key,
    JSON.parse(row.value_json).value,
  ]));
}

function devSigningSecrets(runtime) {
  return clusterState(runtime).databases[TARGET_DB].tables['app.context_signing_secrets'].rows
    .map((row) => row.secret);
}

function envDigests(runtime) {
  return [
    readFileSync(join(runtime.root, '.env'), 'utf8'),
    readFileSync(join(runtime.root, 'apps/webapp/.env.dev'), 'utf8'),
  ];
}

function assertNoDestruction(result) {
  assert.doesNotMatch(result.calls, /^dropdb/mu, 'the target was dropped');
  assert.doesNotMatch(result.calls, /CREATE DATABASE/u, 'the target was recreated');
  assert.doesNotMatch(result.calls, /^pg_restore <--exit-on-error/mu, 'a restore was attempted');
}

function assertNoLeftoverTempDirs() {
  const leftovers = readdirSync('/tmp').filter(
    (entry) => entry.startsWith('bcb-dev-refresh-keys.') || entry.startsWith('bcb-dev-refresh-credentials.'),
  );
  assert.deepEqual(leftovers, [], `the wrapper leaked temporary directories: ${leftovers.join(', ')}`);
}

/**
 * F1 oracle. Replays the modelled cluster events and reports every moment at which something
 * touched the DEV target while that target was connectable, from the drop until the single reopen.
 */
function writerWindow(runtime) {
  const state = clusterState(runtime);
  const window = [];
  let limit = null;
  let destructive = false;
  let reopened = false;
  for (const event of state.events) {
    if (event.database !== TARGET_DB) continue;
    if (event.kind === 'drop-database') { destructive = true; limit = null; continue; }
    if (event.kind === 'create-database') { limit = event.connectionLimit; continue; }
    if (event.kind === 'connection-limit') {
      limit = event.connectionLimit;
      if (destructive && limit !== 0) reopened = true;
      continue;
    }
    if (destructive && !reopened && limit !== 0) window.push(`${event.kind}(limit=${limit})`);
    if (reopened) window.push(`${event.kind} after the target was reopened`);
  }
  return window;
}

// ---------------------------------------------------------------------------
// Refusals before anything is touched
// ---------------------------------------------------------------------------

test('a destructive mode without the confirmation token refuses and touches nothing', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires --confirm-refresh-dev-from-test/u);
  assertNoDestruction(result);
  assert.equal(result.calls, '', 'the wrapper probed the cluster before it had a confirmation');
});

test('--check refuses the destructive confirmation token instead of quietly accepting it', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--check', CONFIRM]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /is a destructive confirmation and is not accepted by --check/u);
  assertNoDestruction(result);
});

test('an unknown argument prints usage and refuses; no argument can name a database', () => {
  const runtime = createRuntime();
  for (const args of [[], ['--target', SOURCE_DB], ['--execute', '--check'], ['--db', TARGET_DB]]) {
    const result = runRefresh(runtime, args);
    assert.equal(result.status, 2, `args ${JSON.stringify(args)} were accepted`);
    assert.match(result.stderr, /Usage:/u);
  }
  assertNoDestruction(runRefresh(runtime, ['--help']));
});

test('the wrapper refuses off the documented DEV/TEST host and on a PROD host', () => {
  const runtime = createRuntime();
  const elsewhere = runRefresh(runtime, ['--execute', CONFIRM], { BCB_TEST_HOST_IPS: '203.0.113.9' });
  assert.notEqual(elsewhere.status, 0);
  assert.match(elsewhere.stderr, new RegExp(`refusing outside the documented DEV/TEST host ${HOST_IP}`, 'u'));
  assertNoDestruction(elsewhere);

  const onProd = runRefresh(runtime, ['--execute', CONFIRM], {
    BCB_TEST_HOST_IPS: `${HOST_IP}\n${PROD_IP}`,
  });
  assert.notEqual(onProd.status, 0);
  assert.match(onProd.stderr, /answers for PROD/u);
  assertNoDestruction(onProd);
});

test('a swapped target identity is refused before anything is dumped or dropped', () => {
  const runtime = createRuntime();
  const swapped = runRefresh(runtime, ['--execute', CONFIRM], {
    BCB_TEST_TARGET_IDENTITY: `${SOURCE_DB}|postgres|true`,
  });
  assert.notEqual(swapped.status, 0);
  assert.match(swapped.stderr, /DEV target must be the exact post-cutover bcb_webapp_dev/u);
  assertNoDestruction(swapped);
  assert.doesNotMatch(swapped.calls, /^pg_dump/mu, 'a dump ran against a misidentified target');
});

test('a missing or unusable TEST source is refused before the destructive phase', () => {
  const runtime = createRuntime();
  for (const identity of ['', `${SOURCE_DB}|false|false`, `${TARGET_DB}|true|false`]) {
    const result = runRefresh(runtime, ['--execute', CONFIRM], { BCB_TEST_SOURCE_IDENTITY: identity });
    assert.notEqual(result.status, 0, `source identity "${identity}" was accepted`);
    assert.match(result.stderr, /TEST source must be the exact connectable bersoncarebot_test/u);
    assertNoDestruction(result);
  }
});

test('a non-local admin channel is refused', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM], { BCB_TEST_LOCAL_SOCKET: 'false' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /admin channel is not the local unix socket/u);
  assertNoDestruction(result);
});

test('a live DEV writer stops the refresh with a named operator action and no process is killed', () => {
  const runtime = createRuntime();
  const listening = runRefresh(runtime, ['--execute', CONFIRM], {
    BCB_TEST_DEV_LISTENERS: 'LISTEN 0 511 127.0.0.1:5200 0.0.0.0:*\n',
  });
  assert.notEqual(listening.status, 0);
  assert.match(listening.stderr, /still listening on 127\.0\.0\.1:5200/u);
  assert.match(listening.stderr, /pnpm run dev:stop/u);
  assert.match(listening.stderr, /never kills processes/u);
  assertNoDestruction(listening);

  const connected = runRefresh(runtime, ['--execute', CONFIRM], {
    BCB_TEST_FOREIGN_BACKENDS: '4',
    BCB_TEST_BACKEND_ROLES: 'bcb_dev_webapp_staff,bcb_dev_integrator',
  });
  assert.notEqual(connected.status, 0);
  assert.match(connected.stderr, /4 application backend\(s\) are still connected/u);
  assert.match(connected.stderr, /bcb_dev_webapp_staff/u);
  assertNoDestruction(connected);
});

test('a target already fail-closed at CONNECTION LIMIT 0 refuses until the previous recovery is finished', () => {
  const runtime = createRuntime({ targetConnectionLimit: 0 });
  const result = runRefresh(runtime, ['--execute', CONFIRM]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already fail-closed at CONNECTION LIMIT 0/u);
  assertNoDestruction(result);
});

test('--check proves readiness, changes nothing and leaves the env files byte-identical', () => {
  const runtime = createRuntime();
  const before = envDigests(runtime);
  const beforeSettings = devSettings(runtime);
  const result = runRefresh(runtime, ['--check']);
  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /check: PASS/u);
  assert.match(result.stdout, /nothing changed/u);
  assertNoDestruction(result);
  assert.doesNotMatch(result.calls, /^pg_dump/mu, '--check produced a dump');
  assert.doesNotMatch(result.calls, /^migrate-dev\.sh/mu, '--check ran the migration gate');
  assert.deepEqual(envDigests(runtime), before, '--check wrote to a DEV env file');
  assert.deepEqual(devSettings(runtime), beforeSettings, '--check changed database rows');
  assertNoLeftoverTempDirs();
});

// ---------------------------------------------------------------------------
// The refresh itself, asserted on resulting rows and values
// ---------------------------------------------------------------------------

test('--execute copies accepted TEST product data and keeps every DEV-owned value', () => {
  const runtime = createRuntime();
  const before = envDigests(runtime);
  const result = runRefresh(runtime, ['--execute', CONFIRM]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /execute: PASS/u);

  // The transport never carries TEST ownership or grants, on either side of the copy.
  assert.match(result.calls, /^pg_dump.*<-Fc> <--no-owner> <--no-acl>.*<bersoncarebot_test>/mu);
  assert.match(result.calls, /^pg_restore <--exit-on-error>.*<--no-owner> <--no-acl>/mu);
  // The pre-refresh DEV snapshot is taken with owners and ACLs, because it is DEV's own state.
  const devSnapshotDump = result.calls
    .split('\n')
    .find((line) => line.startsWith('pg_dump') && line.includes('<bcb_webapp_dev>'));
  assert.ok(devSnapshotDump, 'no pre-refresh DEV snapshot was taken');
  assert.ok(!devSnapshotDump.includes('--no-owner'), 'the DEV rollback snapshot lost its owners');

  // This is the whole point: values, not arguments.
  assert.deepEqual(devSettings(runtime), {
    // product state, from the accepted TEST
    patient_label: 'test-label',
    // environment-owned state, still DEV's own
    app_base_url: 'dev-base-url',
    smsc_api_key: 'dev-smsc',
    smtp_outbound: 'dev-smtp',
    'clinic_bot_token@a1': 'dev-bot-in-test',
    // unclassified in the registry, so DEV keeps its row and TEST's unclassified row is removed
    dev_only_note: 'dev-note',
  });
  assert.deepEqual(devSigningSecrets(runtime), [DEV_SIGNING_SECRET]);
  assert.deepEqual(envDigests(runtime), before, '--execute wrote to a DEV env file');
  assertNoLeftoverTempDirs();
});

test('no TEST environment value, credential or lock survives into DEV', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM]);
  assert.equal(result.status, 0, result.output);

  const values = Object.values(devSettings(runtime));
  for (const marker of ['test-base-url', 'test-smsc', 'test-smtp', 'test-bot-in-test']) {
    assert.ok(!values.includes(marker), `TEST environment value ${marker} survived into DEV`);
  }
  assert.ok(!('test_env_marker' in devSettings(runtime)), 'a TEST-only unclassified row survived');
  assert.ok(
    !devSigningSecrets(runtime).includes(TEST_SIGNING_SECRET),
    'DEV is signing principal context with the TEST credential',
  );

  const dev = clusterState(runtime).databases[TARGET_DB];
  assert.deepEqual(dev.objects, [], 'the TEST environment lock survived into DEV');
  assert.deepEqual(dev.tables['app.principal_context'].rows, [], 'stale TEST principal rows survived');
  assert.deepEqual(dev.tables['app.context_nonce_ledger'].rows, [], 'stale TEST nonces survived');
});

test('the DEV signing secret is re-pinned: dropping the repin is caught, not tolerated', () => {
  const unpinned = createRuntime({
    restoreSqlMutation: (sql) => sql
      .replace('DELETE FROM app.context_signing_secrets;', '')
      .replace(
        'INSERT INTO app.context_signing_secrets (id, secret) SELECT true, secret FROM dev_signing_secret;',
        '',
      ),
  });
  const result = runRefresh(unpinned, ['--execute', CONFIRM]);
  // Either the restore's own count assertion fails, or the run completes with TEST's credential in
  // place. Both must be visible; a green run that kept the TEST secret is the regression this
  // oracle exists for.
  if (result.status === 0) {
    assert.deepEqual(
      devSigningSecrets(unpinned),
      [TEST_SIGNING_SECRET],
      'the mutation did not actually remove the repin, so this oracle proves nothing',
    );
    assert.fail('the refresh reported PASS while DEV kept the TEST principal-context signing secret');
  }
  assert.doesNotMatch(result.stdout, /execute: PASS/u);
});

test('a neutered DEV-state restore cannot pass: the no-op mutation is caught by row state', () => {
  // The exact audit mutation: make the whole restore script a no-op. The wrapper's own gates plus
  // the resulting rows must not agree that this is a successful refresh.
  const neutered = createRuntime({
    restoreSqlMutation: (sql) => sql.replace('\\set ON_ERROR_STOP on', '\\set ON_ERROR_STOP on\n\\quit 0'),
  });
  const result = runRefresh(neutered, ['--execute', CONFIRM]);
  assert.notEqual(result.status, 0, 'a restore that executed nothing reported success');
  assert.doesNotMatch(result.stdout, /execute: PASS/u);
});

test('a DEV-owned credential of an organization that TEST does not carry is dropped, counted and named', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM]);
  assert.equal(result.status, 0, result.output);
  // The row for the DEV-only organization cannot hang on the accepted TEST data graph.
  assert.ok(!('clinic_bot_token@b2' in devSettings(runtime)), 'an orphan per-org row was restored');
  // ... and the one whose organization TEST does carry is untouched.
  assert.equal(devSettings(runtime)['clinic_bot_token@a1'], 'dev-bot-in-test');
  assert.match(result.stdout, /dev_owned_settings_dropped_absent_org=1/u);
  assert.match(result.stdout, /1 DEV-owned per-organization setting row\(s\) were NOT restored/u);
  // The drop is not silent, and it names why.
  assert.match(result.stdout, /organization does not exist in the accepted TEST data/u);
});

test('without the absent-organization policy the refresh dies after the destructive boundary', () => {
  // Restore the pre-fix INSERT: every captured row goes back unconditionally. The foreign key
  // system_settings_organization_id_fkey then aborts the transaction with DEV already replaced.
  const unguarded = createRuntime({
    restoreSqlMutation: (sql) => sql.replace(
      `SELECT key, scope, organization_id, value_json, updated_at, NULL
  FROM dev_owned_setting AS captured
 WHERE captured.organization_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.be_organizations AS organization
       WHERE organization.id = captured.organization_id
    );`,
      `SELECT key, scope, organization_id, value_json, updated_at, NULL
  FROM dev_owned_setting;`,
    ),
  });
  const result = runRefresh(unguarded, ['--execute', CONFIRM]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /restore of DEV-owned environment state failed/u);
  assert.match(result.stderr, /DEV is NOT usable\. Recover with:/u);
  assert.doesNotMatch(result.stdout, /execute: PASS/u);
});

test('a global DEV row is never dropped as an orphan, and no absent-org drop is reported', () => {
  const globalsOnly = createRuntime({
    devSettings: [
      setting('app_base_url', 'dev-base-url'),
      setting('smsc_api_key', 'dev-smsc'),
      setting('clinic_bot_token', 'dev-bot-in-test', { scope: 'organization', organizationId: ORG_IN_TEST }),
    ],
  });
  const result = runRefresh(globalsOnly, ['--execute', CONFIRM]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /dev_owned_settings_dropped_absent_org=0/u);
  assert.doesNotMatch(result.stdout, /were NOT restored/u);
  assert.equal(devSettings(globalsOnly).app_base_url, 'dev-base-url');
  assert.equal(devSettings(globalsOnly)['clinic_bot_token@a1'], 'dev-bot-in-test');
});

// ---------------------------------------------------------------------------
// F1: the recreated target is closed for the whole destructive phase
// ---------------------------------------------------------------------------

test('the recreated DEV target is born closed and stays closed until the one success boundary', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM]);
  assert.equal(result.status, 0, result.output);
  assert.match(
    result.calls,
    /CREATE DATABASE "bcb_webapp_dev" OWNER postgres TEMPLATE template0 CONNECTION LIMIT 0;/u,
    'the target was recreated without a connection limit',
  );
  assert.deepEqual(
    writerWindow(runtime),
    [],
    'the DEV target was reachable by an application process during the destructive phase',
  );
  const limits = clusterState(runtime).events
    .filter((event) => event.database === TARGET_DB && event.kind === 'connection-limit')
    .map((event) => event.connectionLimit);
  assert.equal(limits.at(-1), -1, 'the original connection limit was not restored at the boundary');
  assert.equal(limits.filter((limit) => limit !== 0).length, 1, 'the target was reopened more than once');
});

test('a run that fails after the destructive boundary leaves DEV closed and names the recovery', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM], { BCB_TEST_MIGRATE_DEV_STATUS: '1' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /execute: PASS/u);
  assert.equal(clusterState(runtime).databases[TARGET_DB].connectionLimit, 0);
  assert.match(result.stderr, /DEV is NOT usable\. Recover with:/u);
  assert.match(result.stderr, /--rollback .*\/dev-before\.dump --confirm-refresh-dev-from-test/u);
});

// ---------------------------------------------------------------------------
// F2: the canonical migration gate is inside the success boundary
// ---------------------------------------------------------------------------

test('PASS is unreachable without the canonical migrate-dev gate, which runs before the reopen', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.calls, /^migrate-dev\.sh <--execute> <--host-lock-fd> <9>$/mu);
  assert.ok(
    result.calls.indexOf('settings_in=') < result.calls.indexOf('migrate-dev.sh <--execute>'),
    'the migration gate ran before DEV-owned state was returned',
  );
  // Not an instruction printed after success.
  assert.doesNotMatch(result.stdout, /then --execute/u);
  assert.match(result.stdout, /migrations applied to the current ledger/u);

  const kinds = clusterState(runtime).events
    .filter((event) => event.database === TARGET_DB)
    .map((event) => `${event.kind}${event.kind === 'connection-limit' ? `:${event.connectionLimit}` : ''}`);
  assert.ok(
    kinds.indexOf('migrate-dev-execute') < kinds.indexOf('connection-limit:-1'),
    'DEV was reopened before the current-schema migration gate ran',
  );
});

test('a failed migration gate is not an after-PASS instruction: it fails the refresh', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM], { BCB_TEST_MIGRATE_DEV_STATUS: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /canonical DEV migration gate \(migrate-dev\.sh --execute\) failed/u);
  assert.doesNotMatch(result.stdout, /execute: PASS/u);
});

test('the migration gate is handed this run\'s own held host-lock descriptor', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM]);
  assert.equal(result.status, 0, result.output);
  const line = result.calls.split('\n').find((entry) => entry.startsWith('migrate-dev-lock-fd'));
  assert.ok(line, 'the migration gate was called without an inherited descriptor');
  assert.equal(
    line,
    `migrate-dev-lock-fd <${runtime.lockPath}>`,
    'descriptor 9 in the migration gate is not the shared DEV database wrapper lock',
  );
});

// ---------------------------------------------------------------------------
// Secrets, env and cleanup
// ---------------------------------------------------------------------------

test('--execute never puts a DEV credential in argv or in its own output', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM]);
  assert.equal(result.status, 0, result.output);
  for (const [name, secret] of Object.entries(SECRETS)) {
    assert.ok(!result.calls.includes(secret), `${name} password reached a command line`);
    assert.ok(!result.output.includes(secret), `${name} password was printed`);
  }
  assert.ok(!result.output.includes(DEV_SIGNING_SECRET), 'the signing secret was printed');
  assert.ok(!result.calls.includes(DEV_SIGNING_SECRET), 'the signing secret reached argv');
  assert.ok(!result.output.includes('dev-smsc'), 'a captured setting value was printed');
  assert.ok(!result.output.includes(ORG_ONLY_IN_DEV), 'a dropped row organization id was printed');
});

test('an empty DEV-owned capture refuses before the destructive phase', () => {
  const runtime = createRuntime({ devSettings: [setting('patient_label', 'dev-label')] });
  const result = runRefresh(runtime, ['--execute', CONFIRM]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing to hand TEST environment state to DEV on an empty capture/u);
  assertNoDestruction(result);
});

test('a failed DEV-owned state restore never reports PASS and names the rollback', () => {
  const runtime = createRuntime({
    restoreSqlMutation: (sql) => sql.replace(
      'SELECT 1 / (count(*) > 0)::int AS dev_owned_key_list_is_not_empty FROM dev_owned_static_key;',
      'SELECT 1 / 0 AS injected_restore_failure;',
    ),
  });
  const result = runRefresh(runtime, ['--execute', CONFIRM]);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /execute: PASS/u);
  assert.match(result.stderr, /restore of DEV-owned environment state failed/u);
  assert.match(result.stderr, /DEV is NOT usable\. Recover with:/u);
  assert.match(result.stderr, /--rollback .*\/dev-before\.dump --confirm-refresh-dev-from-test/u);
  // The migration gate must not have run on a half-restored target.
  assert.doesNotMatch(result.calls, /^migrate-dev\.sh/mu);
  // The aborted transaction left no half-written environment state.
  assert.equal(devSettings(runtime).patient_label, 'test-label');
  assert.deepEqual(devSigningSecrets(runtime), [TEST_SIGNING_SECRET]);
});

test('a surviving TEST environment lock is fatal, not a warning', () => {
  const runtime = createRuntime({
    restoreSqlMutation: (sql) => sql.replace(
      'DROP FUNCTION IF EXISTS public.system_settings_test_lock_guard();',
      '',
    ),
  });
  const result = runRefresh(runtime, ['--execute', CONFIRM]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TEST environment lock survived into DEV/u);
  assert.doesNotMatch(result.stdout, /execute: PASS/u);
  assert.doesNotMatch(result.calls, /^migrate-dev\.sh/mu);
});

test('a migrator that kept a capability after reconcile fails the rollback run', () => {
  const runtime = createRuntime();
  const snapshot = join(runtime.root, 'dev-before.dump');
  writeFileSync(snapshot, `PGDMP\n${JSON.stringify({ database: TARGET_DB, tables: {}, objects: [] })}\n`);
  const result = runRefresh(runtime, ['--rollback', snapshot, CONFIRM], {
    BCB_TEST_MIGRATOR_STATIONARY: 'true|false|false|true|0',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /retained a capability after reconcile/u);
  assert.doesNotMatch(result.stdout, /rollback: PASS/u);
});

test('an env file written during the run fails the run instead of reporting PASS', () => {
  const runtime = createRuntime();
  // Simulate any step touching DEV env by mutating it while the wrapper holds its digests: the
  // wrapper recomputes them before declaring success.
  const envPath = join(runtime.root, 'apps/webapp/.env.dev');
  const watcher = spawn(
    'bash',
    ['-c', `for i in $(seq 1 200); do if grep -q settings_in "${runtime.capture}" 2>/dev/null; then printf 'TOUCHED=1\\n' >> "${envPath}"; exit 0; fi; sleep 0.05; done`],
    { stdio: 'ignore' },
  );
  const result = runRefresh(runtime, ['--execute', CONFIRM]);
  watcher.kill();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /env changed during the refresh/u);
  assert.doesNotMatch(result.stdout, /execute: PASS/u);
});

test('the declaration-owned port-context line the migration gate re-renders is not an env violation', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM], { BCB_TEST_MIGRATE_DEV_SYNCS_ENV: '1' });
  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /execute: PASS/u);
  const webappEnv = readFileSync(join(runtime.root, 'apps/webapp/.env.dev'), 'utf8');
  assert.match(webappEnv, /WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON='\{"after":2\}'/u);
  // Everything that is not the declaration-owned projection is still byte-identical.
  assert.match(webappEnv, new RegExp(`DATABASE_URL_STAFF=${urls.staff.replaceAll('/', '\\/')}`, 'u'));
});

// ---------------------------------------------------------------------------
// Rollback and signals
// ---------------------------------------------------------------------------

test('--rollback requires the confirmation token and an absolute, real custom archive', () => {
  const runtime = createRuntime();
  const snapshot = join(runtime.root, 'dev-before.dump');
  writeFileSync(snapshot, `PGDMP\n${JSON.stringify({ database: TARGET_DB, tables: {}, objects: [] })}\n`);

  const unconfirmed = runRefresh(runtime, ['--rollback', snapshot]);
  assert.notEqual(unconfirmed.status, 0);
  assert.match(unconfirmed.stderr, /requires --confirm-refresh-dev-from-test/u);

  const relative = runRefresh(runtime, ['--rollback', 'dev-before.dump', CONFIRM]);
  assert.notEqual(relative.status, 0);
  assert.match(relative.stderr, /rollback snapshot path must be absolute/u);

  const notAnArchive = join(runtime.root, 'not-a-dump');
  writeFileSync(notAnArchive, 'plain text\n');
  const bad = runRefresh(runtime, ['--rollback', notAnArchive, CONFIRM]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /not a readable PostgreSQL custom archive/u);
  assertNoDestruction(bad);
});

test('--rollback puts the pre-refresh DEV rows back and reruns the declaration reconcile', () => {
  const runtime = createRuntime();
  const before = devSettings(runtime);
  const failed = runRefresh(runtime, ['--execute', CONFIRM], { BCB_TEST_MIGRATE_DEV_STATUS: '1' });
  assert.notEqual(failed.status, 0);
  const snapshot = /--rollback (\S+dev-before\.dump)/u.exec(failed.stderr)?.[1];
  assert.ok(snapshot, 'the failed run did not name its snapshot');

  // The call log spans both runs; everything below is asserted on the rollback's own calls.
  const beforeRollback = readFileSync(runtime.capture, 'utf8').length;
  const result = runRefresh(runtime, ['--rollback', snapshot, CONFIRM]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /rollback: PASS/u);
  assert.deepEqual(devSettings(runtime), before, 'the rollback did not restore the DEV rows');
  assert.deepEqual(devSigningSecrets(runtime), [DEV_SIGNING_SECRET]);
  assert.equal(clusterState(runtime).databases[TARGET_DB].connectionLimit, -1);
  const rollbackCalls = result.calls.slice(beforeRollback);
  const restoreLine = rollbackCalls
    .split('\n')
    .find((line) => line.startsWith('pg_restore <--exit-on-error>'));
  assert.ok(restoreLine, 'the rollback did not restore the snapshot');
  assert.ok(!restoreLine.includes('--no-owner'), 'the rollback discarded DEV ownership');
  assert.match(rollbackCalls, /reconcile-access\.mjs/u);
  assert.doesNotMatch(rollbackCalls, /^pg_dump/mu, 'the rollback dumped a database');
  assert.doesNotMatch(rollbackCalls, /<-d> <bersoncarebot_test> .*<-f>/u, 'the rollback read TEST data');
  assertNoLeftoverTempDirs();
});

test('a failed declaration reconcile in rollback never reports PASS and leaves the recovery named', () => {
  const runtime = createRuntime();
  const snapshot = join(runtime.root, 'dev-before.dump');
  writeFileSync(snapshot, `PGDMP\n${JSON.stringify({ database: TARGET_DB, tables: {}, objects: [] })}\n`);
  const result = runRefresh(runtime, ['--rollback', snapshot, CONFIRM], { BCB_TEST_RECONCILE_STATUS: '1' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /rollback: PASS/u);
  assert.match(result.stderr, /DEV is NOT usable\. Recover with:/u);
});

test('a signal during the run runs the cleanup traps instead of leaking private state', async () => {
  const runtime = createRuntime();
  const hold = join(runtime.root, 'pg_dump-holding');
  const child = spawn('bash', [join(runtime.root, 'deploy/host/refresh-dev-from-test.sh'), '--execute', CONFIRM], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BCB_REFRESH_MODEL_STATE: runtime.statePath,
      PATH: `${runtime.bin}:${process.env.PATH ?? ''}`,
      BCB_TEST_PG_DUMP_HOLD: hold,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
  for (let attempt = 0; attempt < 200 && !existsSync(hold); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(existsSync(hold), 'the wrapper never reached its first dump');
  child.kill('SIGTERM');
  const { code } = await exited;
  assert.notEqual(code, 0, 'a signalled run reported success');
  assertNoLeftoverTempDirs();
});

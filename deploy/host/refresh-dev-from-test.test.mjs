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

function createRuntime() {
  const root = mkdtempSync(join(tmpdir(), 'bcb-refresh-dev-'));
  const bin = join(root, 'bin');
  const capture = join(root, 'calls.log');
  for (const directory of [bin, join(root, 'apps/webapp'), join(root, 'deploy/host'), join(root, 'deploy/postgres/privileges')]) {
    mkdirSync(directory, { recursive: true });
  }
  copyFileSync(refreshPath, join(root, 'deploy/host/refresh-dev-from-test.sh'));
  copyFileSync(parserPath, join(root, 'deploy/host/parse-dev-database-url.mjs'));
  copyFileSync(streamPath, join(root, 'deploy/host/stream-canonical-sql.mjs'));
  copyFileSync(captureSqlPath, join(root, 'deploy/postgres/dev-refresh-capture-dev-owned-state.sql'));
  copyFileSync(restoreSqlPath, join(root, 'deploy/postgres/dev-refresh-restore-dev-owned-state.sql'));
  writeFileSync(join(root, 'deploy/postgres/privileges/generate-cli.mjs'), '');
  writeFileSync(join(root, 'deploy/postgres/privileges/reconcile-access.mjs'), '');
  // The real key policy has its own test file; here it is a fixture so this suite tests the
  // wrapper's behaviour and not the registry.
  writeFileSync(
    join(root, 'deploy/host/dev-owned-settings-policy.mjs'),
    `#!/usr/bin/env node
const mode = process.argv[2];
if (mode === '--dev-owned-keys') process.stdout.write('app_base_url\\nsmsc_api_key\\nsmtp_outbound\\n');
else if (mode === '--registry-keys') process.stdout.write('app_base_url\\npatient_label\\nsmsc_api_key\\nsmtp_outbound\\n');
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
      '',
    ].join('\n'),
    { mode: 0o600 },
  );

  const logCall = (name) =>
    `printf '${name}' >> '${capture}'\nfor a in "$@"; do printf ' <%s>' "$a" >> '${capture}'; done\nprintf '\\n' >> '${capture}'\n`;

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
  writeFileSync(
    join(bin, 'psql'),
    `#!/usr/bin/env bash
set -u
${logCall('psql')}
database=''
settings_out=''
signing_secret_out=''
has_signing_secret_out=''
settings_in=''
sql=''
scalar=0
prev=''
for arg in "$@"; do
  case "$prev" in
    -d) database="$arg" ;;
    -Atqc) sql="$arg"; scalar=1 ;;
    -c) sql="$arg" ;;
    -v)
      case "$arg" in
        settings_out=*) settings_out="\${arg#settings_out=}" ;;
        signing_secret_out=*) signing_secret_out="\${arg#signing_secret_out=}" ;;
        has_signing_secret_out=*) has_signing_secret_out="\${arg#has_signing_secret_out=}" ;;
        settings_in=*) settings_in="\${arg#settings_in=}" ;;
      esac
      ;;
  esac
  prev="$arg"
done

if [ "$scalar" = 1 ]; then
  case "$sql" in
    *inet_server_addr*) printf '%s\\n' "\${BCB_TEST_LOCAL_SOCKET:-true}" ;;
    *pg_auth_members*) printf '%s\\n' "\${BCB_TEST_MIGRATOR_STATIONARY:-false|false|false|true|0}" ;;
    *"rolpassword IS NULL"*) printf '%s\\n' "\${BCB_TEST_MIGRATOR_STATE:-false|false|false|true}" ;;
    *pg_roles*) printf '%s\\n' "\${BCB_TEST_OWNER_STATE:-false|false|false}" ;;
    *datconnlimit*) printf '%s\\n' "\${BCB_TEST_CONNLIMIT:--1}" ;;
    *datistemplate*) printf '%s\\n' "\${BCB_TEST_SOURCE_IDENTITY-bersoncarebot_test|true|false}" ;;
    *datdba*) printf '%s\\n' "\${BCB_TEST_TARGET_IDENTITY-bcb_webapp_dev|postgres|true}" ;;
    *string_agg*) printf '%s\\n' "\${BCB_TEST_BACKEND_ROLES:-}" ;;
    *pg_stat_activity*) printf '%s\\n' "\${BCB_TEST_FOREIGN_BACKENDS:-0}" ;;
    *to_regprocedure*) printf '%s\\n' "\${BCB_TEST_TEST_LOCK_PRESENT:-false}" ;;
    *current_database*) printf '%s\\n' "$database" ;;
    *) printf '\\n' ;;
  esac
  exit 0
fi

if [ -n "$settings_out" ]; then
  : > "$settings_out"
  rows="\${BCB_TEST_DEV_OWNED_ROWS:-3}"
  index=0
  while [ "$index" -lt "$rows" ]; do
    printf 'key%s\\tadmin\\t\\\\N\\t{"value":"kept"}\\t2026-09-02 00:00:00+00\\n' "$index" >> "$settings_out"
    index=$((index + 1))
  done
  printf '%s\\n' "\${BCB_TEST_DEV_SIGNING_SECRET:-dev-signing-secret-9f2a}" > "$signing_secret_out"
  printf '%s\\n' "\${BCB_TEST_DEV_HAS_SIGNING_SECRET:-true}" > "$has_signing_secret_out"
  cat > /dev/null
  exit 0
fi

if [ -n "$settings_in" ]; then
  cat > /dev/null
  exit "\${BCB_TEST_DEV_STATE_RESTORE_STATUS:-0}"
fi

[ -t 0 ] || cat > /dev/null
exit 0
`,
  );
  writeFileSync(
    join(bin, 'pg_dump'),
    `#!/usr/bin/env bash
set -u
${logCall('pg_dump')}
prev=''
out=''
for arg in "$@"; do
  [ "$prev" = '-f' ] && out="$arg"
  prev="$arg"
done
if [ -n "\${BCB_TEST_PG_DUMP_HOLD:-}" ]; then
  printf 'holding\\n' > "\${BCB_TEST_PG_DUMP_HOLD}"
  sleep 60
fi
[ -n "$out" ] || exit 3
printf 'PGDMP-fake-archive\\n' > "$out"
exit "\${BCB_TEST_PG_DUMP_STATUS:-0}"
`,
  );
  writeFileSync(
    join(bin, 'pg_restore'),
    `#!/usr/bin/env bash
set -u
${logCall('pg_restore')}
if [ "\${1:-}" = '--list' ]; then
  head -c5 -- "\${2:-/nonexistent}" 2>/dev/null | grep -q PGDMP || exit 4
  exit 0
fi
exit "\${BCB_TEST_PG_RESTORE_STATUS:-0}"
`,
  );
  for (const name of ['dropdb', 'createdb']) {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\nset -u\n${logCall(name)}exit 0\n`);
  }
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
  for (const command of ['hostname', 'ss', 'node', 'psql', 'pg_dump', 'pg_restore', 'dropdb', 'createdb', 'sudo']) {
    chmodSync(join(bin, command), 0o755);
  }
  return { root, bin, capture };
}

function runRefresh(runtime, args, env = {}) {
  const result = spawnSync('bash', [join(runtime.root, 'deploy/host/refresh-dev-from-test.sh'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env, PATH: `${runtime.bin}:${process.env.PATH ?? ''}` },
  });
  result.calls = existsSync(runtime.capture) ? readFileSync(runtime.capture, 'utf8') : '';
  result.output = `${result.stdout}${result.stderr}`;
  return result;
}

function envDigests(runtime) {
  return [
    readFileSync(join(runtime.root, '.env'), 'utf8'),
    readFileSync(join(runtime.root, 'apps/webapp/.env.dev'), 'utf8'),
  ];
}

function assertNoDestruction(result) {
  assert.doesNotMatch(result.calls, /^dropdb/mu, 'the target was dropped');
  assert.doesNotMatch(result.calls, /^createdb/mu, 'the target was recreated');
  assert.doesNotMatch(result.calls, /^pg_restore <--exit-on-error/mu, 'a restore was attempted');
}

function assertNoLeftoverTempDirs() {
  const leftovers = readdirSync('/tmp').filter(
    (entry) => entry.startsWith('bcb-dev-refresh-keys.') || entry.startsWith('bcb-dev-refresh-credentials.'),
  );
  assert.deepEqual(leftovers, [], `the wrapper leaked temporary directories: ${leftovers.join(', ')}`);
}

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
  for (const args of [[], ['--target', 'bersoncarebot_test'], ['--execute', '--check'], ['--db', 'bcb_webapp_dev']]) {
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
    BCB_TEST_TARGET_IDENTITY: 'bersoncarebot_test|postgres|true',
  });
  assert.notEqual(swapped.status, 0);
  assert.match(swapped.stderr, /DEV target must be the exact post-cutover bcb_webapp_dev/u);
  assertNoDestruction(swapped);
  assert.doesNotMatch(swapped.calls, /^pg_dump/mu, 'a dump ran against a misidentified target');
});

test('a missing or unusable TEST source is refused before the destructive phase', () => {
  const runtime = createRuntime();
  for (const identity of ['', 'bersoncarebot_test|false|false', 'bcb_webapp_dev|true|false']) {
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

test('--check proves readiness, changes nothing and leaves the env files byte-identical', () => {
  const runtime = createRuntime();
  const before = envDigests(runtime);
  const result = runRefresh(runtime, ['--check']);
  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /check: PASS/u);
  assert.match(result.stdout, /nothing changed/u);
  assertNoDestruction(result);
  assert.doesNotMatch(result.calls, /^pg_dump/mu, '--check produced a dump');
  assert.doesNotMatch(result.calls, /--shared-role-baseline/u, '--check reconciled the declaration');
  assert.deepEqual(envDigests(runtime), before, '--check wrote to a DEV env file');
  assertNoLeftoverTempDirs();
});

test('--execute copies accepted TEST data without roles, ACLs or owners and reconciles the declaration', () => {
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

  assert.match(result.calls, /^dropdb .*<bcb_webapp_dev>/mu);
  assert.match(result.calls, /^createdb .*<--template=template0> <bcb_webapp_dev>/mu);
  // DEV-owned state is captured before and returned after, and the declaration is the last writer.
  assert.match(result.calls, /<-v> <settings_out=/u);
  assert.match(result.calls, /<-v> <settings_in=/u);
  assert.match(result.calls, /--shared-role-baseline/u);
  assert.match(result.calls, /--shared-role-verify/u);
  assert.match(result.calls, /reconcile-access\.mjs/u);
  assert.ok(
    result.calls.indexOf('settings_in=') < result.calls.indexOf('--shared-role-baseline'),
    'the declaration reconcile must run after DEV-owned state is returned',
  );
  assert.match(result.stdout, /dev_owned_settings_preserved=3/u);
  assert.deepEqual(envDigests(runtime), before, '--execute wrote to a DEV env file');
  assertNoLeftoverTempDirs();
});

test('--execute never puts a DEV credential in argv or in its own output', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM]);
  assert.equal(result.status, 0, result.output);
  for (const [name, secret] of Object.entries(SECRETS)) {
    assert.ok(!result.calls.includes(secret), `${name} password reached a command line`);
    assert.ok(!result.output.includes(secret), `${name} password was printed`);
  }
  assert.ok(!result.output.includes('dev-signing-secret-9f2a'), 'the signing secret was printed');
  assert.ok(!result.calls.includes('dev-signing-secret-9f2a'), 'the signing secret reached argv');
  assert.ok(!result.output.includes('{"value":"kept"}'), 'a captured setting value was printed');
});

test('an empty DEV-owned capture refuses before the destructive phase', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM], { BCB_TEST_DEV_OWNED_ROWS: '0' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing to hand TEST environment state to DEV on an empty capture/u);
  assertNoDestruction(result);
});

test('a failed DEV-owned state restore never reports PASS and names the rollback', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM], { BCB_TEST_DEV_STATE_RESTORE_STATUS: '1' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /execute: PASS/u);
  assert.match(result.stderr, /restore of DEV-owned environment state failed/u);
  assert.match(result.stderr, /DEV is NOT usable\. Recover with:/u);
  assert.match(result.stderr, /--rollback .*\/dev-before\.dump --confirm-refresh-dev-from-test/u);
  // The reconcile must not have run on a half-restored target.
  assert.doesNotMatch(result.calls, /--shared-role-baseline/u);
});

test('a surviving TEST environment lock is fatal, not a warning', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM], { BCB_TEST_TEST_LOCK_PRESENT: 'true' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TEST environment lock survived into DEV/u);
  assert.doesNotMatch(result.stdout, /execute: PASS/u);
});

test('a failed declaration reconcile never reports PASS and leaves the recovery path named', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM], { BCB_TEST_RECONCILE_STATUS: '1' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /execute: PASS/u);
  assert.match(result.stderr, /DEV is NOT usable\. Recover with:/u);
});

test('a migrator that kept a capability after reconcile fails the run', () => {
  const runtime = createRuntime();
  const result = runRefresh(runtime, ['--execute', CONFIRM], {
    BCB_TEST_MIGRATOR_STATIONARY: 'true|false|false|true|0',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /retained a capability after reconcile/u);
  assert.doesNotMatch(result.stdout, /execute: PASS/u);
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
  assert.match(result.stderr, /env changed during the refresh; this wrapper must never write env files/u);
  assert.doesNotMatch(result.stdout, /execute: PASS/u);
});

test('--rollback requires the confirmation token and an absolute, real custom archive', () => {
  const runtime = createRuntime();
  const snapshot = join(runtime.root, 'dev-before.dump');
  writeFileSync(snapshot, 'PGDMP-fake-archive\n');

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

test('--rollback restores DEV with its own owners and reruns the declaration reconcile', () => {
  const runtime = createRuntime();
  const snapshot = join(runtime.root, 'dev-before.dump');
  writeFileSync(snapshot, 'PGDMP-fake-archive\n');
  const result = runRefresh(runtime, ['--rollback', snapshot, CONFIRM]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /rollback: PASS/u);
  const restoreLine = result.calls
    .split('\n')
    .find((line) => line.startsWith('pg_restore <--exit-on-error>'));
  assert.ok(restoreLine, 'the rollback did not restore the snapshot');
  assert.ok(!restoreLine.includes('--no-owner'), 'the rollback discarded DEV ownership');
  assert.match(result.calls, /reconcile-access\.mjs/u);
  assert.doesNotMatch(result.calls, /^pg_dump/mu, 'the rollback dumped a database');
  assert.doesNotMatch(result.calls, /<-d> <bersoncarebot_test> .*<-f>/u, 'the rollback read TEST data');
  assertNoLeftoverTempDirs();
});

test('a signal during the run runs the cleanup traps instead of leaking private state', async () => {
  const runtime = createRuntime();
  const hold = join(runtime.root, 'pg_dump-holding');
  const child = spawn('bash', [join(runtime.root, 'deploy/host/refresh-dev-from-test.sh'), '--execute', CONFIRM], {
    encoding: 'utf8',
    env: {
      ...process.env,
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

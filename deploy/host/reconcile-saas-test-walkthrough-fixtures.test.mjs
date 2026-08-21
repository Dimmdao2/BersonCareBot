import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const source = resolve(import.meta.dirname, 'reconcile-saas-test-walkthrough-fixtures.sh');

function fixture(host = '151.241.228.122') {
  const root = mkdtempSync(resolve(tmpdir(), 'bcb-fixture-door-'));
  const src = resolve(root, 'source');
  const testRepo = resolve(root, 'test');
  const log = resolve(root, 'calls.log');
  const script = resolve(src, 'deploy/host/reconcile-saas-test-walkthrough-fixtures.sh');
  mkdirSync(dirname(script), { recursive: true });
  mkdirSync(resolve(src, '.git'));
  mkdirSync(resolve(src, 'apps/webapp/scripts'), { recursive: true });
  mkdirSync(resolve(testRepo, '.git'), { recursive: true });
  mkdirSync(resolve(testRepo, 'apps/webapp/scripts'), { recursive: true });
  mkdirSync(resolve(testRepo, 'apps/webapp/node_modules/.bin'), { recursive: true });
  writeFileSync(resolve(src, 'apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts'), 'import \'./fixture-import.ts\';\n');
  writeFileSync(resolve(src, 'apps/webapp/scripts/fixture-import.ts'), 'fixture');
  writeFileSync(resolve(testRepo, 'apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts'), 'import \'./fixture-import.ts\';\n');
  writeFileSync(resolve(testRepo, 'apps/webapp/scripts/fixture-import.ts'), 'fixture');
  writeFileSync(resolve(testRepo, 'apps/webapp/node_modules/.bin/tsx'), `#!/bin/bash
set -eu
printf 'tsx_cwd=%s\\n' "$(pwd -P)" >> '${log}'
printf 'tsx_argv=%s\\n' "$*" >> '${log}'
printf 'tsx_home=%s\\n' "$HOME" >> '${log}'
printf 'tsx_node_env=%s\\n' "$NODE_ENV" >> '${log}'
printf 'tsx_use_real_database=%s\\n' "$USE_REAL_DATABASE" >> '${log}'
exit 0
`);
  chmodSync(resolve(testRepo, 'apps/webapp/node_modules/.bin/tsx'), 0o755);
  writeFileSync(resolve(src, 'deploy/host/saas-test-fixture-packet.mjs'), 'fixture');
  let body = readFileSync(source, 'utf8');
  body = body.replace('/home/dev/dev-projects/BersonCareBot', src)
    .replace('/opt/projects/bersoncarebot-test', testRepo)
    .replace('/opt/env/bersoncarebot/saas-test-fixture.env', resolve(root, 'packet'))
    .replace('/tmp/bcb-test-deploy.lock', resolve(root, 'deploy.lock'))
    .replace('/tmp/bcb-test-fixture-seed.state.XXXXXX', resolve(root, 'state.XXXXXX'))
    .replace('/tmp/bcb-test-fixture-seed.pgpass.XXXXXX', resolve(root, 'pgpass.XXXXXX'))
    .replace('/tmp/bcb-test-fixture-seed.env.XXXXXX', resolve(root, 'seed.env.XXXXXX'))
    .replace('find /tmp -maxdepth 1', `find ${root} -maxdepth 1`)
    .replace('SAFE_PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', `SAFE_PATH=${binPlaceholder(root)}`);
  writeFileSync(script, body);
  chmodSync(script, 0o755);
  writeFileSync(resolve(root, 'packet'), 'opaque-test-packet');
  const bin = resolve(root, 'bin');
  mkdirSync(bin);
  writeFileSync(resolve(bin, 'pnpm'), `#!/bin/bash
printf 'pnpm_invoked\\n' >> '${log}'
exit 88
`);
  writeFileSync(resolve(bin, 'corepack'), `#!/bin/bash
printf 'corepack_invoked\\n' >> '${log}'
exit 89
`);
  writeFileSync(resolve(bin, 'hostname'), `#!/bin/bash\nprintf '${host}\\n'\n`);
  writeFileSync(resolve(bin, 'id'), `#!/bin/bash
if [[ "$1" == -u ]]; then printf '%s\\n' "${'${FIXTURE_UID:-1000}'}"; else /usr/bin/id "$@"; fi
`);
  writeFileSync(resolve(bin, 'git'), `#!/bin/bash
set -eu
if [[ "$1" == -C ]]; then repo="$2"; shift 2; fi
[[ -d "$repo/.git" ]] || exit 1
case "$1" in
  rev-parse)
    case "$2" in
      --is-inside-work-tree) printf 'true\\n' ;;
      --show-toplevel) printf '%s\\n' "$repo" ;;
      --verify) printf '0123456789abcdef0123456789abcdef01234567\\n' ;;
      HEAD) printf '0123456789abcdef0123456789abcdef01234567\\n' ;;
    esac
    ;;
  symbolic-ref) printf 'feat/doctor-ui-rebuild\\n' ;;
  diff)
    [[ "$repo" == '${testRepo}' && "\${FIXTURE_TEST_TRACKED_DIRTY:-0}" == 1 ]] && exit 1
    exit 0
    ;;
  merge-base) [[ "\${FIXTURE_TEST_NOT_ANCESTOR:-0}" != 1 ]] ;;
  ls-files) exit 0 ;;
esac
`);
  writeFileSync(resolve(bin, 'systemctl'), `#!/bin/bash
set -eu
if [[ "$1" == is-active ]]; then exit 0; fi
exit 0
`);
  writeFileSync(resolve(bin, 'curl'), '#!/bin/bash\nexit 0\n');
  writeFileSync(resolve(bin, 'sudo'), `#!/bin/bash
set -eu
log='${log}'
printf '%s\\n' "$*" >> "$log"
args="$*"
if [[ "$args" == *'SAAS_TEST_FIXTURE_PACKET_VALIDATE_ONLY=1'* && "\${FAIL_PACKET:-0}" == 1 ]]; then exit 41; fi
if [[ "$args" == *'chown deploy:deploy'* && "\${FAIL_PGPASS_CHOWN:-0}" == 1 ]]; then exit 42; fi
if [[ "$args" == *'test -L '* ]]; then exit 1; fi
if [[ "$args" == *'psql'* && "$args" == *'-d ${'bersoncarebot_test'}'* && "$args" == *'-Atqc'* ]]; then
  if [[ "\${BLOCK_DB_IDENTITY:-0}" == 1 ]]; then while :; do sleep 1; done; fi
  printf '%s\\n' "\${DATABASE_IDENTITY:-bersoncarebot_test}"
  exit 0
fi
if [[ "$args" == *'CREATE ROLE'* ]]; then printf 'created\\n' >> "$log"; exit 0; fi
if [[ "$args" == *'DROP ROLE'* ]]; then
    [[ "\${FAIL_CLEANUP:-0}" == 1 ]] && exit 43
    printf 'dropped\\n' >> "$log"
    exit 0
fi
if [[ "$args" == *'pg_stat_activity'* ]]; then printf '0\\n'; exit 0; fi
if [[ "$args" == *'SELECT (NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = '*'))::text;'* ]]; then
  printf 'verified_absent\\n' >> "$log"
  printf '%s\\n' "\${ROLE_VERIFICATION:-true}"
  exit 0
fi
if [[ "$args" == *'SELECT NOT EXISTS'* ]]; then
  printf 'ERROR: argument of NOT must be type boolean, not type text\\n' >&2
  exit 1
fi
if [[ "$args" == *'psql'* ]]; then exit 0; fi
if [[ "$args" == *'timeout '* ]]; then
  [[ "$args" == *'TEST_REPO=${testRepo}'* && "$args" == *'exec timeout --kill-after=10 300 "$TEST_REPO/apps/webapp/node_modules/.bin/tsx" "$2"'* && "$args" == *'${testRepo}/apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts'* ]] || exit 63
  printf 'seeder_test_local_tsx\\n' >> "$log"
  if [[ "\${BLOCK_SEED:-0}" == 1 ]]; then
    printf 'seed_started\\n' >> "$log"
    trap 'exit 143' TERM INT HUP
    while :; do sleep 1; done
  fi
  [[ "\${FAIL_SEED:-0}" == 1 ]] && exit 23
  shift 3
  "$@"
  exit $?
fi
if [[ "$args" == *'mktemp '* ]]; then template="${'${!#}'}"; mkdir -p "$(dirname "$template")"; mktemp "$template"; exit 0; fi
if [[ "$args" == *'tee '* ]]; then target="${'${!#}'}"; cat >>"$target"; exit 0; fi
if [[ "$args" == *'rm -f -- '* ]]; then rm -f -- "${'${!#}'}"; exit 0; fi
if [[ "$args" == *'find '* ]]; then find '${root}' -maxdepth 1 -type f -name 'state.*' -print -quit; exit 0; fi
exit 0
`);
  chmodSync(resolve(bin, 'hostname'), 0o755);
  chmodSync(resolve(bin, 'id'), 0o755);
  chmodSync(resolve(bin, 'git'), 0o755);
  chmodSync(resolve(bin, 'pnpm'), 0o755);
  chmodSync(resolve(bin, 'corepack'), 0o755);
  chmodSync(resolve(bin, 'systemctl'), 0o755);
  chmodSync(resolve(bin, 'curl'), 0o755);
  chmodSync(resolve(bin, 'sudo'), 0o755);
  return { root, src, testRepo, script, bin, log };
}

function binPlaceholder(root) {
  return `${resolve(root, 'bin')}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`;
}

function run(entry, extra = {}, args = []) {
  return spawnSync('bash', [entry.script, ...args], {
    cwd: entry.src,
    encoding: 'utf8',
    env: { ...process.env, ...extra, PATH: `${entry.bin}:${process.env.PATH}` },
  });
}

function cleanupFixture(t, entry) {
  t.after(() => rmSync(entry.root, { recursive: true, force: true }));
}

function fixtureState(entry) {
  const name = readdirSync(entry.root).find((candidate) => candidate.startsWith('state.'));
  assert.ok(name, 'protected recovery state should exist');
  return resolve(entry.root, name);
}

test('rejects a wrong host before packet/database authority', (t) => {
  const entry = fixture('127.0.0.1');
  cleanupFixture(t, entry);
  const result = run(entry);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /allowed only on DEV\/TEST host/);
  assert.throws(() => readFileSync(entry.log, 'utf8'));
});

test('rejects a source tree that is not a git checkout before temporary authority', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  rmSync(resolve(entry.src, '.git'), { recursive: true });
  const result = run(entry);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(existsSync(entry.log) ? readFileSync(entry.log, 'utf8') : '', /created/);
});

test('rejects a root normal seed before packet or temporary authority', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  const result = run(entry, { FIXTURE_UID: '0' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /run a normal seed as the non-root repository owner/);
  assert.throws(() => readFileSync(entry.log, 'utf8'));
});

test('rejects a packet validator failure before database authority', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  const result = run(entry, { FAIL_PACKET: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /protected TEST fixture packet is invalid/);
  assert.doesNotMatch(readFileSync(entry.log, 'utf8'), /psql|created/);
});

test('invokes the existing seeder with its deterministic double-run proof', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  const result = run(entry);
  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(entry.log, 'utf8');
  assert.match(calls, /SAAS_TEST_FIXTURE_DOUBLE_RUN_PROOF=1/);
  assert.match(calls, /apps\/webapp\/scripts\/seed-saas-test-walkthrough-fixtures\.ts/);
  assert.match(calls, /seeder_test_local_tsx/);
  assert.match(calls, new RegExp(`^tsx_cwd=${entry.testRepo}/apps/webapp$`, 'm'));
  assert.match(calls, new RegExp(`^tsx_argv=${entry.testRepo}/apps/webapp/scripts/seed-saas-test-walkthrough-fixtures\\.ts$`, 'm'));
  assert.match(calls, /tsx_home=\/nonexistent/);
  assert.match(calls, /^tsx_node_env=test$/m);
  assert.match(calls, /^tsx_use_real_database=1$/m);
  assert.doesNotMatch(calls, /pnpm_invoked|corepack_invoked/);
  assert.doesNotMatch(calls, /node --import tsx/);
});

test('rejects a TEST seeder that differs from the reviewed source before temporary authority', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  writeFileSync(resolve(entry.root, 'test/apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts'), 'different');
  const result = run(entry);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TEST fixture seeder differs from the reviewed source checkout/);
  assert.doesNotMatch(existsSync(entry.log) ? readFileSync(entry.log, 'utf8') : '', /created/);
});

test('rejects a dirty imported TEST fixture file before temporary authority', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  writeFileSync(resolve(entry.root, 'test/apps/webapp/scripts/fixture-import.ts'), 'dirty import');
  const result = run(entry, { FIXTURE_TEST_TRACKED_DIRTY: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /tracked TEST checkout changes must be committed/);
  assert.doesNotMatch(existsSync(entry.log) ? readFileSync(entry.log, 'utf8') : '', /created/);
});

test('success runs existing seeder without leaking credentials and removes temporary authority', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  const result = run(entry);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /two clinics reconciled/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /postgresql:\/\/[^\s]*:[^\s]*@|opaque-test-packet/);
  const calls = readFileSync(entry.log, 'utf8');
  assert.match(calls, /created/);
  assert.match(calls, /dropped/);
  assert.match(calls, /SAAS_TEST_FIXTURE_DOUBLE_RUN_PROOF=1/);
  assert.doesNotMatch(calls, /password=/i);
  assert.doesNotMatch(calls, /DATABASE_URL=/);
  assert.match(calls, /systemctl stop bersoncarebot-api-test/);
  assert.match(calls, /systemctl start bersoncarebot-media-worker-test/);
  assert.equal(existsSync(resolve(entry.root, 'deploy.lock')), true, 'normal non-root seed creates the shared deploy lock');
});

test('injected seeder failure still drops temporary authority and does not leak credentials', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  const result = run(entry, { FAIL_SEED: '1' });
  assert.notEqual(result.status, 0);
  assert.match(readFileSync(entry.log, 'utf8'), /dropped/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /postgresql:\/\/[^\s]*:[^\s]*@|opaque-test-packet/);
});

test('rejects wrong database identity before allocating temporary authority', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  const result = run(entry, { DATABASE_IDENTITY: 'bcb_webapp_dev' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /database identity guard failed/);
  assert.doesNotMatch(readFileSync(entry.log, 'utf8'), /created/);
});

test('a failure while securing the temporary credential still removes it', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  const result = run(entry, { FAIL_PGPASS_CHOWN: '1' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(readdirSync(entry.root).filter((name) => name.startsWith('pgpass.')), []);
});

test('cleanup failure is fail-closed and preserves protected recovery state', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  const result = run(entry, { FAIL_CLEANUP: '1' });
  assert.equal(result.status, 70);
  assert.match(result.stderr, /fixture reconciliation recovery is incomplete; TEST service\/role state is preserved/);
  assert.match(readFileSync(fixtureState(entry), 'utf8'), /^role=bcb_test_fixture_seed_[a-z0-9]+$/m);
});

test('root --recover read-opens the existing shared lock and converges when the recorded temporary role is already absent', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  const failed = run(entry, { ROLE_VERIFICATION: 'false' });
  assert.equal(failed.status, 70);
  const state = fixtureState(entry);
  chmodSync(resolve(entry.root, 'deploy.lock'), 0o400);

  const recovered = run(entry, { FIXTURE_UID: '0' }, ['--recover']);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(existsSync(state), false, 'successful recovery removes its protected state');
  const calls = readFileSync(entry.log, 'utf8');
  assert.match(calls, /dropped[\s\S]*verified_absent/);
});

test('root --recover fails closed for a missing, symlinked, or non-regular shared lock', (t) => {
  for (const kind of ['missing', 'symlink', 'directory']) {
    const entry = fixture();
    cleanupFixture(t, entry);
    const lock = resolve(entry.root, 'deploy.lock');
    if (kind === 'symlink') {
      writeFileSync(resolve(entry.root, 'lock-target'), 'lock');
      symlinkSync(resolve(entry.root, 'lock-target'), lock);
    }
    if (kind === 'directory') mkdirSync(lock);

    const result = run(entry, { FIXTURE_UID: '0' }, ['--recover']);
    assert.notEqual(result.status, 0, kind);
    assert.match(result.stderr, /shared TEST deploy lock must be an existing regular non-symlink/);
  }
});

test('root --recover ignores a broken TEST seeder runtime and restores recorded units', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  const failed = run(entry, { ROLE_VERIFICATION: 'false' });
  assert.equal(failed.status, 70);
  const state = fixtureState(entry);
  rmSync(resolve(entry.root, 'test/apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts'));
  rmSync(resolve(entry.root, 'test/apps/webapp/node_modules/.bin/tsx'));

  const recovered = run(entry, { FIXTURE_UID: '0' }, ['--recover']);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(existsSync(state), false, 'successful recovery removes its protected state');
  const calls = readFileSync(entry.log, 'utf8');
  assert.match(calls, /dropped[\s\S]*verified_absent/);
  assert.match(calls, /systemctl start bersoncarebot-media-worker-test/);
});

test('cleanup fails closed when PostgreSQL does not confirm the temporary role is absent', (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  const result = run(entry, { ROLE_VERIFICATION: 'false' });
  assert.equal(result.status, 70);
  assert.match(readFileSync(entry.log, 'utf8'), /verified_absent/);
  assert.ok(existsSync(fixtureState(entry)), 'failed verification retains recovery state');
});

test('an interrupted seed removes temporary authority', async (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  const child = spawn('bash', [entry.script], {
    cwd: entry.src,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, BLOCK_SEED: '1', PATH: `${entry.bin}:${process.env.PATH}` },
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const calls = existsSync(entry.log) ? readFileSync(entry.log, 'utf8') : '';
    if (calls.includes('seed_started')) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  assert.match(readFileSync(entry.log, 'utf8'), /created[\s\S]*seed_started/);
  process.kill(-child.pid, 'SIGTERM');
  await new Promise((resolveClose) => child.once('close', resolveClose));
  assert.match(readFileSync(entry.log, 'utf8'), /seed_started[\s\S]*dropped/);
});

test('a hung database identity check is bounded by the wrapper', async (t) => {
  const entry = fixture();
  cleanupFixture(t, entry);
  const child = spawn('bash', [entry.script], {
    cwd: entry.src,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      BLOCK_DB_IDENTITY: '1',
      BCB_TEST_FIXTURE_DB_TIMEOUT_S: '0.1',
      PATH: `${entry.bin}:${process.env.PATH}`,
    },
  });
  const completed = await Promise.race([
    new Promise((resolveClose) => child.once('close', () => resolveClose(true))),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(false), 750)),
  ]);
  if (!completed && child.pid) {
    process.kill(-child.pid, 'SIGKILL');
    await new Promise((resolveClose) => child.once('close', resolveClose));
  }
  assert.equal(completed, true, 'wrapper left a database safety call unbounded');
});

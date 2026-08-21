import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
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
  const script = resolve(src, 'deploy/host/reconcile-saas-test-walkthrough-fixtures.sh');
  mkdirSync(dirname(script), { recursive: true });
  mkdirSync(resolve(src, '.git'));
  mkdirSync(resolve(src, 'apps/webapp/scripts'), { recursive: true });
  mkdirSync(resolve(testRepo, '.git'), { recursive: true });
  writeFileSync(resolve(src, 'apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts'), 'fixture');
  writeFileSync(resolve(src, 'deploy/host/saas-test-fixture-packet.mjs'), 'fixture');
  let body = readFileSync(source, 'utf8');
  body = body.replace('/home/dev/dev-projects/BersonCareBot', src)
    .replace('/opt/projects/bersoncarebot-test', testRepo)
    .replace('/opt/env/bersoncarebot/saas-test-fixture.env', resolve(root, 'packet'))
    .replace('/run/bersoncarebot/saas-test-fixture-seed.state', resolve(root, 'run/state'))
    .replace('/tmp/bcb-test-deploy.lock', resolve(root, 'deploy.lock'))
    .replace('/tmp/bcb-test-fixture-seed.XXXXXX', resolve(root, 'pgpass.XXXXXX'));
  writeFileSync(script, body);
  chmodSync(script, 0o755);
  writeFileSync(resolve(root, 'packet'), 'opaque-test-packet');
  const bin = resolve(root, 'bin');
  mkdirSync(bin);
  const log = resolve(root, 'calls.log');
  writeFileSync(resolve(bin, 'hostname'), `#!/bin/bash\nprintf '${host}\\n'\n`);
  writeFileSync(resolve(bin, 'sudo'), `#!/bin/bash
set -eu
log='${log}'
printf '%s\\n' "$*" >> "$log"
args="$*"
if [[ "$args" == *'SAAS_TEST_FIXTURE_PACKET_VALIDATE_ONLY=1'* && "\${FAIL_PACKET:-0}" == 1 ]]; then exit 41; fi
if [[ "$args" == *'chown deploy:deploy'* && "\${FAIL_PGPASS_CHOWN:-0}" == 1 ]]; then exit 42; fi
if [[ "$args" == *'psql'* && "$args" == *'-d ${'bersoncarebot_test'}'* && "$args" == *'-Atqc'* ]]; then
  if [[ "\${BLOCK_DB_IDENTITY:-0}" == 1 ]]; then while :; do sleep 1; done; fi
  printf '%s\\n' "\${DATABASE_IDENTITY:-bersoncarebot_test}"
  exit 0
fi
if [[ "$args" == *'SELECT NOT EXISTS'* ]]; then printf 'true\\n'; exit 0; fi
if [[ "$args" == *'psql'* ]]; then
  input="$(cat || true)"
  [[ "$input" == *'CREATE ROLE'* ]] && printf 'created\\n' >> "$log"
  if [[ "$input" == *'DROP ROLE'* ]]; then
    [[ "\${FAIL_CLEANUP:-0}" == 1 ]] && exit 43
    printf 'dropped\\n' >> "$log"
  fi
  exit 0
fi
if [[ "$args" == *'timeout '* ]]; then
  if [[ "\${BLOCK_SEED:-0}" == 1 ]]; then
    printf 'seed_started\\n' >> "$log"
    trap 'exit 143' TERM INT HUP
    while :; do sleep 1; done
  fi
  [[ "\${FAIL_SEED:-0}" == 1 ]] && exit 23
  exit 0
fi
if [[ "$args" == *'install -d '* ]]; then mkdir -p '${resolve(root, 'run')}'; exit 0; fi
if [[ "$args" == *'tee ${resolve(root, 'run/state')}'* ]]; then cat >'${resolve(root, 'run/state')}'; exit 0; fi
if [[ "$args" == *'rm -f -- ${resolve(root, 'run/state')}'* ]]; then rm -f -- '${resolve(root, 'run/state')}'; exit 0; fi
exit 0
`);
  chmodSync(resolve(bin, 'hostname'), 0o755);
  chmodSync(resolve(bin, 'sudo'), 0o755);
  return { root, src, script, bin, log };
}

function run(entry, extra = {}) {
  return spawnSync('bash', [entry.script], {
    cwd: entry.src,
    encoding: 'utf8',
    env: { ...process.env, ...extra, PATH: `${entry.bin}:${process.env.PATH}` },
  });
}

function cleanupFixture(t, entry) {
  t.after(() => rmSync(entry.root, { recursive: true, force: true }));
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
  assert.doesNotMatch(readFileSync(entry.log, 'utf8'), /created/);
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
  assert.doesNotMatch(calls, /systemctl/);
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
  assert.match(result.stderr, /temporary fixture authority cleanup failed; recovery:/);
  assert.match(readFileSync(resolve(entry.root, 'run/state'), 'utf8'), /^bcb_test_fixture_seed_[a-z0-9]+\n$/);
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
    env: { ...process.env, BLOCK_DB_IDENTITY: '1', PATH: `${entry.bin}:${process.env.PATH}` },
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

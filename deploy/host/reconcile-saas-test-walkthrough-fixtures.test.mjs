import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const source = resolve(import.meta.dirname, 'reconcile-saas-test-walkthrough-fixtures.sh');

function fixture(host = '151.241.228.122') {
  const root = mkdtempSync(resolve(tmpdir(), 'bcb-fixture-door-'));
  const src = resolve(root, 'source');
  const testRepo = resolve(root, 'test');
  const script = resolve(src, 'deploy/host/reconcile-saas-test-walkthrough-fixtures.sh');
  mkdirSync(dirname(script), { recursive: true });
  mkdirSync(resolve(src, 'apps/webapp/scripts'), { recursive: true });
  mkdirSync(resolve(testRepo, '.git'), { recursive: true });
  writeFileSync(resolve(src, 'apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts'), 'fixture');
  writeFileSync(resolve(src, 'deploy/host/saas-test-fixture-packet.mjs'), 'fixture');
  let body = readFileSync(source, 'utf8');
  body = body.replace('/home/dev/dev-projects/BersonCareBot', src)
    .replace('/opt/projects/bersoncarebot-test', testRepo)
    .replace('/opt/env/bersoncarebot/saas-test-fixture.env', resolve(root, 'packet'))
    .replace('/run/bersoncarebot/saas-test-fixture-seed.state', resolve(root, 'run/state'))
    .replace('/tmp/bcb-test-deploy.lock', resolve(root, 'deploy.lock'));
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
if [[ "$args" == *'psql'* && "$args" == *'-d ${'bersoncarebot_test'}'* && "$args" == *'-Atqc'* ]]; then printf 'bersoncarebot_test\\n'; exit 0; fi
if [[ "$args" == *'SELECT NOT EXISTS'* ]]; then printf 'true\\n'; exit 0; fi
if [[ "$args" == *'psql'* ]]; then input="$(cat || true)"; [[ "$input" == *'CREATE ROLE'* ]] && printf 'created\\n' >> "$log"; [[ "$input" == *'DROP ROLE'* ]] && printf 'dropped\\n' >> "$log"; exit 0; fi
if [[ "$args" == *'timeout '* ]]; then [[ "\${FAIL_SEED:-0}" == 1 ]] && exit 23; exit 0; fi
if [[ "$args" == *'tee '* ]]; then cat >/dev/null; exit 0; fi
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

test('rejects a wrong host before packet/database authority', () => {
  const entry = fixture('127.0.0.1');
  const result = run(entry);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /allowed only on DEV\/TEST host/);
  assert.throws(() => readFileSync(entry.log, 'utf8'));
});

test('success runs existing seeder without leaking credentials and removes temporary authority', () => {
  const entry = fixture();
  const result = run(entry);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /two clinics reconciled/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /postgresql:\/\/[^\s]*:[^\s]*@|opaque-test-packet/);
  const calls = readFileSync(entry.log, 'utf8');
  assert.match(calls, /created/);
  assert.match(calls, /dropped/);
  assert.doesNotMatch(calls, /password=/i);
  assert.doesNotMatch(calls, /systemctl/);
});

test('injected seeder failure still drops temporary authority and does not leak credentials', () => {
  const entry = fixture();
  const result = run(entry, { FAIL_SEED: '1' });
  assert.notEqual(result.status, 0);
  assert.match(readFileSync(entry.log, 'utf8'), /dropped/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /postgresql:\/\/[^\s]*:[^\s]*@|opaque-test-packet/);
});

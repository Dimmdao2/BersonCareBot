import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const lib = resolve(import.meta.dirname, 'saas-isolation-coverage-gate-lib.sh');

// The gate's only real effect is the privileged command it hands to the runtime identity, so the
// fixture replaces `sudo` with a recorder: every assertion below reads the command line the deploy
// would have run.
function fixture(sudoExit = 0) {
  const root = mkdtempSync(resolve(tmpdir(), 'bcb-isolation-coverage-gate-'));
  const bin = resolve(root, 'bin');
  mkdirSync(bin);
  const log = resolve(root, 'sudo.log');
  writeFileSync(
    resolve(bin, 'sudo'),
    `#!/bin/bash\nprintf '%s\\n' "$*" >> "${log}"\nexit ${sudoExit}\n`,
  );
  chmodSync(resolve(bin, 'sudo'), 0o755);
  writeFileSync(resolve(root, 'webapp.test'), 'PLACEHOLDER=1\n');
  return { root, bin, log };
}

function runGate(entry, body) {
  const script = `set -Eeuo pipefail
DEPLOY_REPO=${entry.root}
WEBAPP_ENV=${entry.root}/webapp.test
source ${lib}
${body}
echo "CALLER_CONTINUED"
`;
  return spawnSync('/bin/bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${entry.bin}:${process.env.PATH ?? ''}` },
  });
}

test('the gate produces coverage for the marked window with the caller-stated check count', () => {
  const entry = fixture();
  const before = new Date().toISOString();
  const result = runGate(
    entry,
    'mark_e1_runtime_coverage_start\nrun_e1_post_runtime_coverage_gate 9',
  );
  assert.equal(result.status, 0, result.stderr);
  const call = readFileSync(entry.log, 'utf8').trim();
  assert.match(call, /sudo -E -u bcb-web-test node_modules\/.bin\/tsx/);
  assert.match(call, /report-saas-isolation-diagnostics\.ts post-runtime-gate/);
  assert.doesNotMatch(call, /-u deploy/);
  assert.match(call, /--checks 9/);
  const startedAt = /--started-at '([^']+)'/.exec(call);
  assert.ok(startedAt, `no --started-at in: ${call}`);
  assert.ok(startedAt[1] >= before, `${startedAt[1]} predates the marked window start ${before}`);
  assert.match(result.stdout, /E1 post-runtime coverage\/read gate: OK/);
});

test('each caller states its own check count instead of inheriting a hardcoded one', () => {
  const entry = fixture();
  const result = runGate(
    entry,
    'mark_e1_runtime_coverage_start\nrun_e1_post_runtime_coverage_gate 14',
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(entry.log, 'utf8'), /--checks 14/);
});

test('a red diagnostic gate warns and leaves the running TEST deploy alive', () => {
  const entry = fixture(1);
  const result = runGate(
    entry,
    'mark_e1_runtime_coverage_start\nrun_e1_post_runtime_coverage_gate 9',
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /TEST deploy CONTINUES/);
  assert.match(result.stdout, /CALLER_CONTINUED/);
});

test('coverage is refused when no window start was marked before the restart', () => {
  const entry = fixture();
  const result = runGate(entry, 'run_e1_post_runtime_coverage_gate 9');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /coverage start was not recorded/);
  assert.throws(() => readFileSync(entry.log, 'utf8'));
});

test('coverage is refused when the caller states no check count', () => {
  const entry = fixture();
  const result = runGate(
    entry,
    'mark_e1_runtime_coverage_start\nrun_e1_post_runtime_coverage_gate',
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /needs the performed check count/);
  assert.throws(() => readFileSync(entry.log, 'utf8'));
});

test('the library refuses to run as an entrypoint', () => {
  const result = spawnSync('/bin/bash', [lib], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /is a sourced library/);
});

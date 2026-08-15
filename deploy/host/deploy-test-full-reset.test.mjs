import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const source = resolve(import.meta.dirname, 'deploy-test-full-reset.sh');

function fixture(pnpmExit = 0) {
  const root = mkdtempSync(resolve(tmpdir(), 'bcb-full-reset-test-'));
  const wrapper = resolve(root, 'deploy/host/deploy-test-full-reset.sh');
  mkdirSync(dirname(wrapper), { recursive: true });
  cpSync(source, wrapper);
  chmodSync(wrapper, 0o755);
  const bin = resolve(root, 'bin');
  mkdirSync(bin);
  const log = resolve(root, 'calls.log');
  writeFileSync(
    resolve(bin, 'pnpm'),
    `#!/bin/bash\nprintf 'pnpm|%s|%s\\n' "$PWD" "$*" >> "${log}"\nexit ${pnpmExit}\n`,
  );
  writeFileSync(
    resolve(bin, 'bash'),
    `#!/bin/bash\nprintf 'shared|%s|%s\\n' "$PWD" "$*" >> "${log}"\n`,
  );
  chmodSync(resolve(bin, 'pnpm'), 0o755);
  chmodSync(resolve(bin, 'bash'), 0o755);
  return { root, wrapper, bin, log };
}

function run(entry, args) {
  return spawnSync('/bin/bash', [entry.wrapper, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${entry.bin}:${process.env.PATH ?? ''}` },
  });
}

test('same-checkout snapshot preflight precedes the shared destructive reset', () => {
  const entry = fixture();
  const result = run(entry, ['--confirm-full-reset']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(entry.log, 'utf8').trim().split('\n'), [
    `pnpm|${entry.root}|run check:prod-to-target-cutover`,
    `shared|${process.cwd()}|${resolve(entry.root, 'deploy/host/deploy-test-saas.sh')} --confirm-full-reset`,
  ]);
});

test('failed snapshot preflight propagates and never invokes the shared reset', () => {
  const entry = fixture(37);
  const result = run(entry, ['--confirm-full-reset']);
  assert.equal(result.status, 37);
  assert.equal(readFileSync(entry.log, 'utf8').trim(), `pnpm|${entry.root}|run check:prod-to-target-cutover`);
});

test('missing owner confirmation fails before preflight', () => {
  const entry = fixture();
  const result = run(entry, []);
  assert.equal(result.status, 2);
  assert.throws(() => readFileSync(entry.log, 'utf8'));
});

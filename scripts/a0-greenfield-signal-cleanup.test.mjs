import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prefix = 'bcb_saas_a0_verify_';

function scratchRoots() {
  return new Set(
    fs
      .readdirSync(os.tmpdir(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
      .map((entry) => path.join(os.tmpdir(), entry.name)),
  );
}

test('SIGTERM stops the exact disposable PostgreSQL cluster and removes its scratch root', async () => {
  const before = scratchRoots();
  const child = spawn(process.execPath, ['scripts/verify-a0-greenfield-baseline.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, A0_SIGNAL_CLEANUP_TEST: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  try {
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error(`signal_test_ready_timeout:${stderr}`)),
        30_000,
      );
      const poll = setInterval(() => {
        if (stdout.includes('A0_SIGNAL_CLEANUP_TEST_READY')) {
          clearInterval(poll);
          clearTimeout(deadline);
          resolve();
        }
      }, 50);
      child.once('exit', (code, signal) => {
        clearInterval(poll);
        clearTimeout(deadline);
        reject(new Error(`verifier_exited_before_signal:${code ?? signal}:${stderr}`));
      });
    });

    const during = [...scratchRoots()].filter((candidate) => !before.has(candidate));
    assert.equal(during.length, 1, `expected one new exact scratch root, got ${during.join(',')}`);
    const [scratchRoot] = during;
    const completion = new Promise((resolve) => {
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    child.kill('SIGTERM');
    const result = await completion;
    assert.deepEqual(result, { code: 143, signal: null });
    assert.equal(fs.existsSync(scratchRoot), false, `scratch root survived: ${scratchRoot}`);
    const processList = spawnSync('/usr/bin/ps', ['-eo', 'args='], { encoding: 'utf8' });
    assert.equal(processList.status, 0);
    assert.equal(
      String(processList.stdout).includes(scratchRoot),
      false,
      'PostgreSQL process survived',
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
});

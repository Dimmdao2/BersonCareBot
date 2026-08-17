// Both B0 gate self-test matrices work by mutating one shared checkout and then running the
// repository-wide gate over it, so two of them in flight at once see each other's mutations and go
// red on a healthy tree. `node --test <fileA> <fileB>` runs test FILES in separate processes in
// parallel, and that is the ordinary invocation, so the barrier serialises itself with a
// cross-process lock instead of depending on a `--test-concurrency=1` flag a human has to remember.
//
// The lock lives in the OS temp directory, keyed by the checkout path: a lock file inside the
// repository would itself show up in the checkout the gate scans. `mkdir` is the atomic primitive —
// it fails with EEXIST when another process already holds the lock.

import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const checkoutRoot = resolve(import.meta.dirname, '..');
const lockDirectory = resolve(
  tmpdir(),
  `b0-gate-selftest-${createHash('sha256').update(checkoutRoot).digest('hex').slice(0, 16)}.lock`,
);
const staleAfterMs = 15 * 60 * 1000;
let held = false;

function sleep(milliseconds) {
  // The wait has to block this process: the hook that acquires the lock runs before any test, and a
  // non-blocking wait would let the matrix start mutating the checkout before the lock is granted.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function acquireCheckoutLock({ timeoutMs = 30 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      mkdirSync(lockDirectory);
      writeFileSync(resolve(lockDirectory, 'owner'), `${process.pid} ${checkoutRoot}\n`);
      held = true;
      return lockDirectory;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    try {
      // A killed holder must not wedge the barrier for ever.
      if (Date.now() - statSync(lockDirectory).mtimeMs > staleAfterMs) {
        rmSync(lockDirectory, { recursive: true, force: true });
        continue;
      }
    } catch {
      continue;
    }
    if (Date.now() > deadline) {
      throw new Error(`B0 gate self-test checkout lock was never granted: ${lockDirectory}`);
    }
    sleep(50);
  }
}

export function releaseCheckoutLock() {
  if (!held) return;
  held = false;
  rmSync(lockDirectory, { recursive: true, force: true });
}

// A crash between acquire and release still releases, so a failing matrix never blocks the next run.
process.on('exit', releaseCheckoutLock);

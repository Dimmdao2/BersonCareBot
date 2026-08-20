#!/usr/bin/env node
/**
 * Stage 9 release gate: appointments-domain reconciliation.
 * Run after CI for go/no-go. DB URLs are only for reconcile.
 *
 * Usage: pnpm run stage9-gate
 * Exit: 0 when the check passes; 1 when it fails.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadCutoverEnv } from './load-cutover-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

loadCutoverEnv();

function run(cmd, args, cwd, name) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: cwd || rootDir,
      stdio: 'inherit',
      shell: false,
    });
    child.on('close', (code) => resolve(code !== 0 ? name : null));
  });
}

async function main() {
  const failed = [];
  const reconcile = await run(
    'pnpm',
    ['--dir', 'apps/webapp', 'run', 'reconcile-appointments-domain'],
    rootDir,
    'reconcile-appointments-domain',
  );
  if (reconcile) failed.push(reconcile);

  if (failed.length > 0) {
    console.error('[stage9-gate] failed:', failed.join(', '));
    process.exit(1);
  }
  console.log('[stage9-gate] ok: appointments reconciliation passed');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

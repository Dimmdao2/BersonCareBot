#!/usr/bin/env node
/**
 * Stage 11 release gate: subscription/mailing-domain reconciliation.
 * Run after CI for go/no-go. DB URLs are only for reconcile.
 *
 * Usage: pnpm run stage11-gate
 * Exit: 0 when the check passes; 1 when it fails.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadCutoverEnv } from './load-cutover-env.mjs';
import { runWithTimeout } from './spawn-with-timeout.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

loadCutoverEnv();

async function main() {
  const failed = [];
  const reconcile = await runWithTimeout(
    'pnpm',
    ['--dir', 'apps/webapp', 'run', 'reconcile-subscription-mailing-domain'],
    { cwd: rootDir, name: 'reconcile-subscription-mailing-domain' },
  );
  if (reconcile) failed.push(reconcile);

  if (failed.length > 0) {
    console.error('[stage11-gate] failed:', failed.join(', '));
    process.exit(1);
  }
  console.log('[stage11-gate] ok: subscription/mailing reconciliation passed');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

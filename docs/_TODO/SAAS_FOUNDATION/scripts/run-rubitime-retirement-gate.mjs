#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const HELP = `Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/run-rubitime-retirement-gate.mjs --mode=current
  node docs/_TODO/SAAS_FOUNDATION/scripts/run-rubitime-retirement-gate.mjs --mode=complete

Runs the Rubitime retirement gate commands and prints a summary. Unlike a shell
chain, complete mode runs every sub-gate and reports all blockers in one pass.`;

const gates = {
  current: [
    ['R0 freeze', ['node', 'docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-retirement-r0-freeze.mjs']],
    ['R6/R7 pre-cutoff inventory', ['node', 'docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs']],
    [
      'doctor/client no appointment_records reads',
      ['node', 'docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-doctor-client-no-appointment-records.mjs'],
    ],
    ['RR proof manifest', ['node', 'docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-retirement-proofs.mjs']],
    [
      'DB cleanup sequence',
      ['node', 'docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-db-cleanup-sequence.mjs'],
    ],
    ['R7 table disposition', ['node', 'docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-r7-table-disposition.mjs']],
    ['section 10 docs', ['node', 'docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-section10-docs.mjs']],
    ['final gate manifest', ['node', 'docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-final-gate.mjs']],
  ],
  complete: [
    [
      'final gate complete',
      ['node', 'docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-final-gate.mjs', '--require-complete'],
    ],
    [
      'RR proofs complete',
      ['node', 'docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-retirement-proofs.mjs', '--require-complete'],
    ],
    [
      'post-R6 inventory',
      ['node', 'docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs', '--expect-post-r6'],
    ],
    [
      'R7 drop-ready disposition',
      ['node', 'docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-r7-table-disposition.mjs', '--require-drop-ready'],
    ],
  ],
};

function parseMode() {
  if (process.argv.includes('--help')) {
    console.log(HELP);
    process.exit(0);
  }
  const explicit = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = explicit?.slice('--mode='.length) ?? process.argv[2] ?? 'current';
  if (!Object.hasOwn(gates, mode)) {
    console.error(`Unsupported mode: ${mode}`);
    console.error(HELP);
    process.exit(2);
  }
  return mode;
}

const mode = parseMode();
const results = [];

for (const [name, command] of gates[mode]) {
  const [bin, ...args] = command;
  console.log(`\n=== ${name} ===`);
  console.log(`$ ${[bin, ...args].join(' ')}`);
  const result = spawnSync(bin, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const status = result.status ?? 1;
  results.push({ name, command: [bin, ...args].join(' '), status });
}

const failed = results.filter((result) => result.status !== 0);
console.log(
  JSON.stringify(
    {
      mode,
      ok: failed.length === 0,
      results,
    },
    null,
    2,
  ),
);

if (failed.length > 0) {
  console.error(`run-rubitime-retirement-gate: FAILED (${failed.length}/${results.length})`);
  process.exit(1);
}

console.log('run-rubitime-retirement-gate: OK');

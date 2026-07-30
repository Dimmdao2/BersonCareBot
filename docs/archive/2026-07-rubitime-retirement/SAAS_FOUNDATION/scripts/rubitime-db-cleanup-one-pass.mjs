#!/usr/bin/env node
// ARCHIVE ONLY: Rubitime retired 2026-07-27. Do not use as a current operator entrypoint.
throw new Error('ARCHIVE ONLY: retired Rubitime cleanup one-shot is not executable');

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const DEFAULT_ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const DEFAULT_CANONICAL_SPECIALIST = 'c9515025-7224-4d9b-86b6-9cb7d26ea503';
const DEFAULT_OWNER_PHONE = '89643805480';

const HELP = `Usage:
  DATABASE_URL='<fresh-copy-db-url>' \\
  node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-db-cleanup-one-pass.mjs \\
    --csv=<fresh-rubitime-csv> --execute

Optional:
  --dump=<approved-fresh-dump>   Check dump TOC before DB cleanup gates.
  --run-saas-migrations          Run scripts/deploy-saas-667.sh first; requires SUPERUSER_URL and DATABASE_URL.
  --commit-cleanup               Execute approved cleanup writes after dry-runs on the same DB.
  --allow-test-target            Allow TEST DB names. Required for TEST rehearsals.
  --org-id=<uuid>                Organization for specialist consolidation.
  --canonical-specialist=<uuid>  Canonical specialist for consolidation.
  --owner-phone=<phone>          Owner doctor phone for historical CSV import.

Default mode is plan-only. --execute is required to run commands.

Safety:
  - Refuses live-like and permanent dev DB names.
  - Allows disposable/rehearsal DB names by default.
  - Allows TEST only with --allow-test-target.
  - No ad hoc \`UPDATE\`, no ad hoc \`DELETE\`, and no direct \`DROP TABLE\`.
  - Does not create final proof placeholders and never runs DROP TABLE.`;

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const hit = args.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  return {
    help: args.includes('--help'),
    execute: args.includes('--execute'),
    commitCleanup: args.includes('--commit-cleanup'),
    allowTestTarget: args.includes('--allow-test-target'),
    runSaasMigrations: args.includes('--run-saas-migrations'),
    csv: get('csv'),
    dump: get('dump'),
    orgId: get('org-id') ?? DEFAULT_ORG_ID,
    canonicalSpecialist: get('canonical-specialist') ?? DEFAULT_CANONICAL_SPECIALIST,
    ownerPhone: get('owner-phone') ?? DEFAULT_OWNER_PHONE,
  };
}

function commandToString([bin, ...args]) {
  const printableArgs = args.map((arg) => {
    if (
      arg.startsWith('--owner-phone=') ||
      arg.startsWith('--historical-owner-doctor-phone=') ||
      arg.startsWith('--canonical=') ||
      arg.startsWith('--canonical-specialist=') ||
      arg.startsWith('--org=') ||
      arg.startsWith('--org-id=')
    ) {
      return `${arg.slice(0, arg.indexOf('=') + 1)}<redacted>`;
    }
    return arg.includes(' ') ? JSON.stringify(arg) : arg;
  });
  return [bin, ...printableArgs].join(' ');
}

function runStep(step, command, options = {}) {
  // `advisory`/`reason` are this wrapper's own step metadata — keep them out of the spawn options.
  const { advisory = false, reason = '', ...spawnOptions } = options;
  console.log(`\n=== ${step} ===`);
  console.log(`$ ${commandToString(command)}`);
  const result = spawnSync(command[0], command.slice(1), {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...spawnOptions,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if ((result.status ?? 1) !== 0) {
    // Advisory steps report a real, loud signal but must not abort the DATA pipeline. Used only for
    // static CODE expectations that this DB wrapper cannot influence (see the plan entry's `reason`).
    if (advisory) {
      console.error(`\n!!! ADVISORY (NOT FATAL): ${step} failed with status ${result.status ?? 1}`);
      console.error(`!!! WHY THIS IS NOT FATAL HERE: ${reason}`);
      console.error('!!! This must still be closed before the real PROD cutover — see');
      console.error(
        '!!! docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md §2.5 (Track C R3-R6).\n',
      );
      return;
    }
    throw new Error(`${step} failed with status ${result.status ?? 1}`);
  }
}

function readTargetDatabaseName() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for --execute');
  }
  const result = spawnSync(
    'psql',
    [process.env.DATABASE_URL, '-X', '-v', 'ON_ERROR_STOP=1', '-Atqc', 'SELECT current_database()'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if ((result.status ?? 1) !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error('could not read target database name via DATABASE_URL');
  }
  return result.stdout.trim();
}

function assertSafeTarget(dbName, allowTestTarget, databaseUrl) {
  const exactForbidden = new Set([
    'bcb_webapp_prod',
    'bersoncarebot',
    'bersoncarebot_prod',
    'bcb_webapp_dev',
    'bersoncarebot_dev',
  ]);
  if (exactForbidden.has(dbName) || /(^|[_-])prod(uction)?($|[_-])/i.test(dbName)) {
    throw new Error(`refusing unsafe live-like database: ${dbName}`);
  }
  if (/(^|[_-])dev($|[_-])/i.test(dbName)) {
    throw new Error(`refusing permanent dev database: ${dbName}`);
  }
  if (/(^|[_-])test($|[_-])/i.test(dbName) || dbName.endsWith('_test')) {
    if (!allowTestTarget) {
      throw new Error(`TEST target ${dbName} requires --allow-test-target`);
    }
    const host = new URL(databaseUrl).hostname;
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
      throw new Error(`refusing non-loopback TEST database host: ${host || '<empty>'}`);
    }
    return;
  }
  if (!/(rubitime|rehearsal|fresh|tmp|temp|scratch|disposable|restore)/i.test(dbName)) {
    throw new Error(
      `target database ${dbName} is not an obvious disposable rehearsal DB; use a clearly disposable name or TEST with --allow-test-target`,
    );
  }
}

function makeBackfillCommand(csv, extraArgs) {
  return [
    'pnpm',
    '--dir',
    'apps/webapp',
    'run',
    'backfill-canonical-from-legacy-appointments',
    '--',
    ...extraArgs,
    '--summary-only',
    `--csv=${csv}`,
  ];
}

function makePlaceholderPurgeCommand(opts, commit) {
  return [
    'pnpm',
    '--dir',
    'apps/webapp',
    'run',
    'purge-placeholder-bookings',
    '--',
    '--summary-only',
    ...(opts.allowTestTarget ? ['--allow-test-target'] : []),
    ...(commit ? ['--commit'] : []),
  ];
}

function buildPlan(opts) {
  const steps = [];
  if (opts.dump) {
    steps.push(['dump TOC check', ['pg_restore', '--list', opts.dump]]);
  }
  if (opts.runSaasMigrations) {
    steps.push(['SaaS migration wrapper', ['bash', 'scripts/deploy-saas-667.sh']]);
  }
  steps.push([
    'R1 clean-dump preflight',
    [
      'node',
      'docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-clean-dump-preflight.mjs',
      ...(opts.allowTestTarget ? ['--allow-test-target'] : []),
      `--csv=${opts.csv}`,
    ],
  ]);
  steps.push(['placeholder bookings dry-run', makePlaceholderPurgeCommand(opts, false)]);
  if (opts.commitCleanup) {
    steps.push(['placeholder bookings commit', makePlaceholderPurgeCommand(opts, true)]);
  }
  steps.push([
    'specialist consolidation dry-run',
    [
      'pnpm',
      '--dir',
      'apps/webapp',
      'run',
      'consolidate-specialist-identity',
      '--',
      '--summary-only',
      `--canonical=${opts.canonicalSpecialist}`,
      `--org=${opts.orgId}`,
    ],
  ]);
  if (opts.commitCleanup) {
    steps.push([
      'specialist consolidation commit',
      [
        'pnpm',
        '--dir',
        'apps/webapp',
        'run',
        'consolidate-specialist-identity',
        '--',
        '--summary-only',
        '--commit',
        `--canonical=${opts.canonicalSpecialist}`,
        `--org=${opts.orgId}`,
      ],
    ]);
  }
  const cleanupPasses = [
    [
      'legacy test/canceled duplicate cleanup',
      ['--cleanup-only', '--delete-test', '--collapse-canceled-dups'],
    ],
    ['legacy non-confirmed cleanup', ['--cleanup-only', '--delete-non-confirmed']],
    [
      'owner CSV historical import/projection',
      [`--historical-owner-doctor-phone=${opts.ownerPhone}`],
    ],
    ['post-import legacy non-confirmed cleanup', ['--cleanup-only', '--delete-non-confirmed']],
    ['legacy stale-vs-CSV cleanup', ['--cleanup-only', '--drop-stale-from-csv']],
  ];
  for (const [name, args] of cleanupPasses) {
    steps.push([`${name} dry-run`, makeBackfillCommand(opts.csv, args)]);
    if (opts.commitCleanup) {
      steps.push([`${name} commit`, makeBackfillCommand(opts.csv, ['--commit', ...args])]);
    }
  }
  steps.push([
    'R1 classifier',
    [
      'node',
      'docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs',
      ...(opts.allowTestTarget ? ['--allow-test-target'] : []),
      `--csv=${opts.csv}`,
    ],
  ]);
  steps.push([
    'R1 dual-source audit',
    [
      'node',
      'docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs',
      ...(opts.allowTestTarget ? ['--allow-test-target'] : []),
      '--threshold-minutes=5',
      '--sample-size=0',
    ],
  ]);
  return steps;
}

const opts = parseArgs();
if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

const errors = [];
if (!opts.csv) errors.push('--csv=<fresh-rubitime-csv> is required');
if (opts.csv && !existsSync(opts.csv)) errors.push(`CSV not found: ${opts.csv}`);
if (opts.dump && !existsSync(opts.dump)) errors.push(`dump not found: ${opts.dump}`);
if (opts.runSaasMigrations && opts.execute && !process.env.SUPERUSER_URL) {
  errors.push('SUPERUSER_URL is required with --run-saas-migrations --execute');
}
if (errors.length > 0) {
  for (const error of errors) console.error(`FATAL: ${error}`);
  process.exit(2);
}

const plan = buildPlan(opts);
console.log(
  JSON.stringify(
    {
      mode: opts.execute ? 'execute' : 'plan',
      commitCleanup: opts.commitCleanup,
      dump: opts.dump ? basename(opts.dump) : null,
      csv: opts.csv,
      r7DropStatus:
        'gated: no DROP TABLE and no final R7 proof placeholder are produced by this wrapper',
      steps: plan.map(([name, command]) => ({ name, command: commandToString(command) })),
    },
    null,
    2,
  ),
);

if (!opts.execute) {
  console.log('rubitime-db-cleanup-one-pass: PLAN ONLY');
  process.exit(0);
}

try {
  const configuredDatabase = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, '');
  assertSafeTarget(configuredDatabase, opts.allowTestTarget, process.env.DATABASE_URL);
  const dbName = readTargetDatabaseName();
  assertSafeTarget(dbName, opts.allowTestTarget, process.env.DATABASE_URL);
  console.log(`rubitime-db-cleanup-one-pass: target DB ${dbName}`);
  for (const [name, command, stepOptions] of plan) {
    runStep(name, command, stepOptions ?? {});
  }
  console.log('rubitime-db-cleanup-one-pass: OK');
} catch (error) {
  console.error(
    `rubitime-db-cleanup-one-pass: FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

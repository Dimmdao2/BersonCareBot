#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

const scriptPath = 'docs/_TODO/SAAS_FOUNDATION/scripts/run-phase4-prod-copy-rehearsal.mjs';
const p2ProofRunner = 'docs/_TODO/SAAS_FOUNDATION/scripts/run-p2-d-proof-package.mjs';
const phase3SignupSmoke =
  'docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs';
const b4RoleSmoke = 'docs/_TODO/SAAS_FOUNDATION/scripts/smoke-b4-locked-runtime-principal.mjs';
const dbStateChecker = 'docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs';

const rehearsalUrlEnv = 'PHASE4_REHEARSAL_DATABASE_URL';
const allowedHostsEnv = 'PHASE4_REHEARSAL_ALLOWED_HOSTS';
const safeRehearsalDbNamePattern = /^bcb_saas_[a-z0-9_]+_(scratch|rehearsal)_[a-z0-9_]+$/;
const forbiddenDbNames = new Set([
  'bcb_webapp_prod',
  'bcb_webapp_test',
  'bcb_webapp_dev',
  'bersoncarebot_prod',
  'bersoncarebot_test',
  'bersoncarebot_dev',
  'production',
  'prod',
  'test',
  'dev',
]);
const forbiddenHostnames = new Set([
  '135.106.162.170',
  'bcb-prod',
  'prod',
  'production',
  'bersoncarebot-prod',
]);

const requiredGateIds = [
  'compat.signup_disabled',
  'compat.shadow_missing_principal_zero',
  'prod_copy.fresh_disposable_copy',
  'prod_copy.no_prod_test_dev_db',
  'prod_copy.db_state_catalog',
  'env_boundary.prod_separate_cluster',
  'env_boundary.dev_test_shared_nonprod',
  'roles.app_staff_app_patient_names',
  'current_clinic.doctor_flow',
  'current_clinic.patient_flow',
  'current_clinic.integrator_flow',
  'current_clinic.scheduler_flow',
  'current_clinic.queue_flow',
  'current_clinic.media_flow',
  'current_clinic.pre_auth_flow',
  'synthetic.org_b_patient_b2_created',
  'synthetic.staff_a_cannot_read_or_write_b',
  'synthetic.patient_a_cannot_read_other_patient',
  'synthetic.unset_context_fail_closed',
  'signup.creates_org_without_sql',
  'guards.value_664_green',
  'process_family.real_app_staff_role',
  'process_family.real_app_patient_role',
  'cutover.force_only_in_final_migration',
];

function usage() {
  return [
    'Usage:',
    `  node ${scriptPath} [--mode=preflight] [--require-rehearsal-url] [--evidence=phase4-evidence.json]`,
    `  node ${scriptPath} --mode=gates`,
    `  node ${scriptPath} --mode=db-state`,
    '',
    'Modes:',
    '  preflight  DB-free default. Refuses unsafe DB hints, runs syntax/static proof gates, and checks optional evidence.',
    '  gates      Prints the required Phase 4 live evidence gate IDs without running subprocesses.',
    `  db-state   Connects only to ${rehearsalUrlEnv}, after the disposable DB safety guard, and checks catalog state.`,
    '',
    'Optional inputs:',
    `  ${rehearsalUrlEnv}=postgres://.../bcb_saas_<name>_rehearsal_<suffix>`,
    `  ${allowedHostsEnv}=host1,host2  Required by db-state mode for non-loopback rehearsal hosts.`,
    '  --require-rehearsal-url  Fail if the rehearsal URL env var is absent.',
    '  --evidence=<path>        JSON evidence with gate statuses. Does not print evidence details.',
    '',
    'DB safety:',
    '  Preflight (the default) and gates modes never connect to a database or print URLs or secrets.',
    `  DB-state mode connects only to ${rehearsalUrlEnv} after the safety guard and never prints that URL.`,
    '  DB-state mode allows loopback hosts by default; any remote non-prod host must be explicitly listed',
    `  in ${allowedHostsEnv}.`,
    '  Any DATABASE_URL, PGDATABASE, or rehearsal URL hint must name an explicit disposable',
    '  bcb_saas_*_scratch_* or bcb_saas_*_rehearsal_* database. Prod/test/dev-shaped names are refused.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    evidencePath: null,
    mode: 'preflight',
    requireRehearsalUrl: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--require-rehearsal-url') {
      args.requireRehearsalUrl = true;
      continue;
    }
    if (arg.startsWith('--evidence=')) {
      args.evidencePath = arg.slice('--evidence='.length);
      continue;
    }
    if (arg.startsWith('--mode=')) {
      args.mode = arg.slice('--mode='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  if (!new Set(['preflight', 'gates', 'db-state']).has(args.mode)) {
    throw new Error(`Unsupported mode: ${args.mode}\n\n${usage()}`);
  }

  return args;
}

function databaseNameFromUrl(value) {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/^\/+/, '');
    return pathname ? decodeURIComponent(pathname) : null;
  } catch {
    return null;
  }
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function unsafeDbNameReason(name) {
  if (!name) return 'empty or unparsable DB name';
  const normalized = name.toLowerCase();

  if (forbiddenDbNames.has(normalized)) {
    return `forbidden DB name ${name}`;
  }
  if (/(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/.test(normalized)) {
    return `prod/test/dev-shaped DB name ${name}`;
  }
  if (!safeRehearsalDbNamePattern.test(normalized)) {
    return `DB name must match bcb_saas_*_scratch_* or bcb_saas_*_rehearsal_*, got ${name}`;
  }

  return null;
}

function unsafeHostReason(hostname) {
  if (!hostname) return null;
  const normalized = hostname.toLowerCase();
  if (forbiddenHostnames.has(normalized)) {
    return 'forbidden production host';
  }
  if (/(^|[.-])(prod|production)([.-]|$)/.test(normalized)) {
    return 'prod/production-shaped host';
  }
  return null;
}

function assertSafeDbHint(source, value, { isUrl, quietAcceptance = false }) {
  const dbName = isUrl ? databaseNameFromUrl(value) : value;
  const hostReason = isUrl ? unsafeHostReason(hostnameFromUrl(value)) : null;
  if (hostReason) {
    throw new Error(`${source}: ${hostReason}; refusing Phase 4 rehearsal preflight`);
  }

  const dbReason = unsafeDbNameReason(dbName);
  if (dbReason) {
    throw new Error(`${source}: ${dbReason}; refusing Phase 4 rehearsal preflight`);
  }

  if (!quietAcceptance) {
    console.log(`[phase4] accepted ${source} database hint: ${dbName}`);
  }
}

function assertSafeEnvironment({ requireRehearsalUrl, quietAcceptance = false }) {
  if (process.env.PGHOST) {
    const hostReason = unsafeHostReason(process.env.PGHOST);
    if (hostReason) {
      throw new Error(`PGHOST: ${hostReason}; refusing Phase 4 rehearsal preflight`);
    }
  }

  if (process.env.DATABASE_URL) {
    assertSafeDbHint('DATABASE_URL', process.env.DATABASE_URL, { isUrl: true, quietAcceptance });
  }
  if (process.env.PGDATABASE) {
    assertSafeDbHint('PGDATABASE', process.env.PGDATABASE, { isUrl: false, quietAcceptance });
  }
  if (process.env[rehearsalUrlEnv]) {
    assertSafeDbHint(rehearsalUrlEnv, process.env[rehearsalUrlEnv], {
      isUrl: true,
      quietAcceptance,
    });
  } else if (requireRehearsalUrl) {
    throw new Error(`${rehearsalUrlEnv} is required for this preflight but is not set`);
  }
}

function sanitizedChildEnv() {
  const env = { ...process.env };
  for (const key of [
    'DATABASE_URL',
    'PGDATABASE',
    'PGHOST',
    'PGPASSWORD',
    'PGPASSFILE',
    'PGPORT',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGUSER',
    rehearsalUrlEnv,
  ]) {
    delete env[key];
  }
  return env;
}

function runStep(label, command, env) {
  console.log(`\n[phase4] ${label}`);
  console.log(`$ ${command.join(' ')}`);

  const [bin, ...args] = command;
  const result = spawnSync(bin, args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with status ${result.status ?? 'unknown'}`);
  }
}

function printGateList() {
  console.log('[phase4] required live evidence gates:');
  for (const gateId of requiredGateIds) {
    console.log(`- ${gateId}`);
  }
}

function normalizeEvidence(rawEvidence) {
  if (Array.isArray(rawEvidence)) {
    return new Map(rawEvidence.map((item) => [String(item.id), String(item.status ?? '')]));
  }
  if (rawEvidence && typeof rawEvidence === 'object' && rawEvidence.gates) {
    if (Array.isArray(rawEvidence.gates)) {
      return new Map(rawEvidence.gates.map((item) => [String(item.id), String(item.status ?? '')]));
    }
    if (typeof rawEvidence.gates === 'object') {
      return new Map(Object.entries(rawEvidence.gates).map(([id, status]) => [id, String(status)]));
    }
  }
  throw new Error('evidence JSON must be an array of {id,status} or an object with gates');
}

function assertEvidence(pathname) {
  const absolutePath = path.resolve(repoRoot, pathname);
  const evidence = normalizeEvidence(JSON.parse(readFileSync(absolutePath, 'utf8')));
  const passingStatuses = new Set(['pass', 'passed', 'ok', 'done']);
  const missing = [];
  const failing = [];

  for (const gateId of requiredGateIds) {
    const status = evidence.get(gateId);
    if (!status) {
      missing.push(gateId);
      continue;
    }
    if (!passingStatuses.has(status.toLowerCase())) {
      failing.push(gateId);
    }
  }

  if (missing.length > 0 || failing.length > 0) {
    throw new Error(
      [
        'Phase 4 evidence is incomplete.',
        missing.length > 0 ? `missing gates: ${missing.join(', ')}` : null,
        failing.length > 0 ? `non-passing gates: ${failing.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  console.log(`[phase4] evidence OK: ${requiredGateIds.length} required gates marked passing`);
}

function runPreflight(args) {
  assertSafeEnvironment({ requireRehearsalUrl: args.requireRehearsalUrl });

  const env = sanitizedChildEnv();
  const steps = [
    ['syntax: Phase 4 runner', ['node', '--check', scriptPath]],
    ['syntax: Phase 3 signup smoke', ['node', '--check', phase3SignupSmoke]],
    ['syntax: B4 locked runtime smoke', ['node', '--check', b4RoleSmoke]],
    ['static proof package: Phase 2 gates', ['node', p2ProofRunner, '--mode=static']],
  ];

  for (const [label, command] of steps) {
    runStep(label, command, env);
  }

  if (args.evidencePath) {
    assertEvidence(args.evidencePath);
  } else {
    console.log(
      '\n[phase4] live rehearsal gates were not validated; no --evidence file was provided.',
    );
    printGateList();
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === 'gates') {
    printGateList();
    return;
  }

  if (args.mode === 'db-state') {
    assertSafeEnvironment({ requireRehearsalUrl: true, quietAcceptance: true });
    const env = sanitizedChildEnv();
    env[rehearsalUrlEnv] = process.env[rehearsalUrlEnv];
    runStep('disposable prod-copy DB catalog state', ['node', dbStateChecker], env);
    console.log('\n[phase4] DB-state check OK');
    return;
  }

  runPreflight(args);
  console.log('\n[phase4] preflight OK');
}

try {
  main();
} catch (error) {
  console.error(`[phase4] FAILED: ${error.message}`);
  process.exit(1);
}

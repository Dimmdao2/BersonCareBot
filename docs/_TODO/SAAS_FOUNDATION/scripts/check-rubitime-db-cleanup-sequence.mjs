#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const HELP = `Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-db-cleanup-sequence.mjs
  node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-db-cleanup-sequence.mjs --self-test

Checks the repo-first Rubitime DB cleanup sequence package. Static only: no DB,
env, SSH, service, webhook, pg_dump, pg_restore, psql, or migration is run.`;

const sequenceDoc = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md';
const r7Runbook = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md';
const dispositionDoc = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md';
const finalGateManifest = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_FINAL_GATE_MANIFEST.md';
const ownerGatePacket = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_OWNER_GATE_PACKET.md';
const onePassScript = 'docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-db-cleanup-one-pass.mjs';
const fullResetLauncher = 'deploy/host/deploy-test-full-reset.sh';
const freshTestWrapper = 'deploy/host/deploy-test-saas.sh';
const codeOnlyTestWrapper = 'deploy/host/deploy-test.sh';
const deploy667 = 'scripts/deploy-saas-667.sh';
const placeholderPurge = 'apps/webapp/scripts/purge-placeholder-bookings.ts';
const specialistConsolidation = 'apps/webapp/scripts/consolidate-specialist-identity.ts';
const fioApply = 'apps/webapp/scripts/fio-backfill/apply-owner-reviewed-fio-test.ts';
const currentCanonicalSpecialist = 'c9515025-7224-4d9b-86b6-9cb7d26ea503';

const requiredSequenceFragments = [
  'repo-first, TEST/disposable-DB cleanup sequence',
  'one-pass fresh-copy/TEST cleanup package',
  'One-Pass Entrypoints',
  'rubitime-db-cleanup-one-pass.mjs',
  'rubitime:db-cleanup:one-pass',
  'deploy-test-full-reset.sh',
  '--confirm-full-reset',
  '--fio-manifest-file-sha256',
  '--fio-review-source-sha256',
  'Ordinary code deploys use `deploy/host/deploy-test.sh` and never restore the database.',
  'mandatory post-import non-confirmed cleanup',
  'reviewed FIO apply',
  'scripts/deploy-saas-667.sh',
  'does not approve or describe live-environment work',
  'does not create final proof placeholders',
  'does not generate a destructive migration',
  'Fresh Rubitime CSV decides the appointment preservation set',
  'integrator.rubitime_records` and `integrator.rubitime_events` are audit/rollback material',
  'Archive candidates',
  'Table Disposition',
  'Migration Order For Future Execution',
  'Validation Order',
  'Rollback And Restore Contract',
  'SaaS Handoff Checklist',
  'Quarantine That Remains After This Prep',
  'RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md',
  'check:rubitime-retirement-complete` must remain red',
];

const requiredOnePassFragments = [
  'DATABASE_URL',
  'SUPERUSER_URL',
  '--run-saas-migrations',
  '--commit-cleanup',
  '--allow-test-target',
  'post-import legacy non-confirmed cleanup',
  '--summary-only',
  'refusing unsafe live-like database',
  'No ad hoc',
  'r7DropStatus',
];

const requiredTables = [
  'public.appointment_records',
  'integrator.rubitime_records',
  'integrator.rubitime_events',
  'integrator.rubitime_api_throttle',
  'integrator.rubitime_booking_profiles',
  'integrator.rubitime_branches',
  'integrator.rubitime_services',
  'integrator.rubitime_cooperators',
  'public.patient_bookings',
  'public.be_external_entity_mappings',
  'integrator.booking_calendar_map',
  'public.booking_*',
];

const linkedDocs = [r7Runbook, dispositionDoc, finalGateManifest, ownerGatePacket];

function readRel(rel) {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8');
}

function requireMention(errors, src, rel, fragment) {
  if (!src?.includes(fragment)) errors.push(`${rel}: missing ${fragment}`);
}

function requireOrdered(errors, src, rel, fragments) {
  let cursor = 0;
  for (const fragment of fragments) {
    const index = src?.indexOf(fragment, cursor) ?? -1;
    if (index < 0) {
      errors.push(`${rel}: missing ordered fragment after offset ${cursor}: ${fragment}`);
      return;
    }
    cursor = index + fragment.length;
  }
}

function codeOnlyIsolationErrors(src) {
  const isolationErrors = [];
  for (const fragment of [
    'deploy-test-full-reset.sh',
    'BCB_TEST_FULL_RESET_ENTRYPOINT',
    '--confirm-full-reset',
    'restore-test-db.sh',
  ]) {
    if (src?.includes(fragment)) isolationErrors.push(fragment);
  }
  return isolationErrors;
}

if (process.argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

const errors = [];
const sequenceSrc = readRel(sequenceDoc);

if (!sequenceSrc) {
  errors.push(`missing ${sequenceDoc}`);
} else {
  for (const fragment of requiredSequenceFragments) {
    requireMention(errors, sequenceSrc, sequenceDoc, fragment);
  }
  for (const table of requiredTables) {
    requireMention(errors, sequenceSrc, sequenceDoc, table);
  }
  for (const rel of linkedDocs) {
    requireMention(errors, sequenceSrc, sequenceDoc, rel);
  }
  requireMention(errors, sequenceSrc, sequenceDoc, onePassScript);
}

const onePassSrc = readRel(onePassScript);
if (!onePassSrc) {
  errors.push(`missing ${onePassScript}`);
} else {
  for (const fragment of requiredOnePassFragments) {
    requireMention(errors, onePassSrc, onePassScript, fragment);
  }
  requireOrdered(errors, onePassSrc, onePassScript, [
    'R1 clean-dump preflight',
    'placeholder bookings dry-run',
    'placeholder bookings commit',
    'specialist consolidation dry-run',
    'specialist consolidation commit',
    'legacy test/canceled duplicate cleanup',
    'legacy non-confirmed cleanup',
    'owner CSV historical import/projection',
    'post-import legacy non-confirmed cleanup',
    'legacy stale-vs-CSV cleanup',
    'R1 classifier',
    'R1 dual-source audit',
  ]);
}

const freshWrapperSrc = readRel(freshTestWrapper);
const fullResetLauncherSrc = readRel(fullResetLauncher);
const codeOnlyWrapperSrc = readRel(codeOnlyTestWrapper);
const deploy667Src = readRel(deploy667);
const placeholderPurgeSrc = readRel(placeholderPurge);
const specialistConsolidationSrc = readRel(specialistConsolidation);
const fioApplySrc = readRel(fioApply);

for (const [rel, src] of [
  [fullResetLauncher, fullResetLauncherSrc],
  [freshTestWrapper, freshWrapperSrc],
  [codeOnlyTestWrapper, codeOnlyWrapperSrc],
  [deploy667, deploy667Src],
  [placeholderPurge, placeholderPurgeSrc],
  [specialistConsolidation, specialistConsolidationSrc],
  [fioApply, fioApplySrc],
]) {
  if (!src) errors.push(`missing ${rel}`);
}

if (fullResetLauncherSrc) {
  for (const fragment of [
    '--confirm-full-reset',
    'BCB_TEST_FULL_RESET_ENTRYPOINT=deploy-test-full-reset-v1',
    'exec bash "$SCRIPT_DIR/deploy-test-saas.sh" "$@"',
    'For ordinary code deploys use: bash deploy/host/deploy-test.sh [branch]',
  ])
    requireMention(errors, fullResetLauncherSrc, fullResetLauncher, fragment);
}

if (freshWrapperSrc) {
  for (const fragment of [
    '--confirm-full-reset',
    '--rubitime-csv-sha256',
    '--fio-manifest-file-sha256',
    '--fio-manifest-sha256',
    '--fio-review-source-sha256',
    'rubitime:db-cleanup:one-pass',
    'fio:owner-reviewed-test:verify',
    'fio:owner-reviewed-test:apply',
    'stage_hash_bound_rubitime_csv',
    'assert_staged_rubitime_csv_ready',
    'root:deploy:440',
  ])
    requireMention(errors, freshWrapperSrc, freshTestWrapper, fragment);
  requireOrdered(errors, freshWrapperSrc, freshTestWrapper, [
    'log "build (install + build + build:webapp + media-worker + assets)"',
    'fio:owner-reviewed-test:verify',
    'log "stop TEST writers before restore/migration"',
    'sudo -u postgres bash "$RESTORE" "$DUMP"',
  ]);
  requireOrdered(errors, freshWrapperSrc, freshTestWrapper, [
    'sudo -u postgres bash "$RESTORE" "$DUMP"',
    'pnpm migrate',
    'canonical Rubitime/history cleanup-import chain',
    'assert_staged_rubitime_csv_ready',
    'fio:owner-reviewed-test:apply',
    'run_strict_post_migration_closure',
    'DONE — full data-ready TEST migration',
  ]);
  requireMention(
    errors,
    freshWrapperSrc,
    freshTestWrapper,
    `CANONICAL_SPECIALIST=${currentCanonicalSpecialist}`,
  );
  requireMention(
    errors,
    freshWrapperSrc,
    freshTestWrapper,
    'direct destructive invocation is disabled',
  );
  requireMention(
    errors,
    freshWrapperSrc,
    freshTestWrapper,
    'deploy/host/deploy-test-full-reset.sh',
  );
}

if (codeOnlyWrapperSrc) {
  requireMention(
    errors,
    codeOnlyWrapperSrc,
    codeOnlyTestWrapper,
    'code-only путь НИКОГДА не восстанавливает',
  );
  for (const fragment of codeOnlyIsolationErrors(codeOnlyWrapperSrc)) {
    errors.push(
      `${codeOnlyTestWrapper}: code-only wrapper contains forbidden destructive fragment: ${fragment}`,
    );
  }
}

if (process.argv.includes('--self-test') && codeOnlyWrapperSrc) {
  const mutations = [
    '\nbash deploy/host/deploy-test-full-reset.sh --confirm-full-reset\n',
    '\nexport BCB_TEST_FULL_RESET_ENTRYPOINT=deploy-test-full-reset-v1\n',
    '\nbash /tmp/bcb-test-setup/restore-test-db.sh /tmp/dump\n',
  ];
  const undetected = mutations.filter(
    (mutation) => codeOnlyIsolationErrors(`${codeOnlyWrapperSrc}${mutation}`).length === 0,
  );
  if (undetected.length > 0)
    errors.push(`${codeOnlyTestWrapper}: destructive isolation self-test failed`);
}

if (deploy667Src) {
  requireMention(
    errors,
    deploy667Src,
    deploy667,
    `--canonical=${currentCanonicalSpecialist} --summary-only --commit`,
  );
  if (deploy667Src.includes('--canonical=518ea988-9b5e-4ad8-8194-a2d98f43bd7b')) {
    errors.push(`${deploy667}: stale specialist canonical remains executable`);
  }
}

if (placeholderPurgeSrc) {
  for (const fragment of [
    '--summary-only',
    '--allow-test-target',
    "await import('@/app-layer/db/drizzle')",
    'current_database()',
    'assertAllowedPurgeDatabaseTarget',
    'targetPhoneAdminUsers',
    "eq(platformUsers.role, 'admin')",
    'notInArray(',
    ".for('update')",
    '0o600',
  ]) {
    requireMention(errors, placeholderPurgeSrc, placeholderPurge, fragment);
  }
  if (placeholderPurgeSrc.includes('new pg.Pool'))
    errors.push(`${placeholderPurge}: raw pg pool is forbidden`);
}

if (onePassSrc) {
  for (const fragment of [
    'makePlaceholderPurgeCommand(opts, false)',
    'makePlaceholderPurgeCommand(opts, true)',
  ]) {
    requireMention(errors, onePassSrc, onePassScript, fragment);
  }
}

if (specialistConsolidationSrc) {
  for (const fragment of [
    'be_organization_members',
    'getDrizzle',
    '--summary-only',
    '0o600',
    'validateExplicitCanonicalCandidate',
    "reason: 'inactive'",
    "reason: 'organization_mismatch'",
  ])
    requireMention(errors, specialistConsolidationSrc, specialistConsolidation, fragment);
  if (specialistConsolidationSrc.includes('new pg.Pool')) {
    errors.push(`${specialistConsolidation}: raw pg pool is forbidden`);
  }
}

if (fioApplySrc) {
  for (const fragment of [
    'getDrizzle',
    'current_database()',
    '--test',
    '--confirm-manifest-sha256',
  ]) {
    requireMention(errors, fioApplySrc, fioApply, fragment);
  }
  if (fioApplySrc.includes('new pg.Pool')) errors.push(`${fioApply}: raw pg pool is forbidden`);
}

for (const rel of linkedDocs) {
  const src = readRel(rel);
  if (!src) {
    errors.push(`missing ${rel}`);
    continue;
  }
  requireMention(errors, src, rel, sequenceDoc);
  requireMention(errors, src, rel, 'repo-first');
}

const result = {
  sequenceDoc,
  onePassScript,
  linkedDocs,
  requiredTables,
  requiredSequenceFragments,
  requiredOnePassFragments,
  currentCanonicalSpecialist,
  fullResetChain: [fullResetLauncher, freshTestWrapper, onePassScript, placeholderPurge, fioApply],
};

console.log(JSON.stringify(result, null, 2));

if (errors.length > 0) {
  console.error('check-rubitime-db-cleanup-sequence: FAILED');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('check-rubitime-db-cleanup-sequence: OK');

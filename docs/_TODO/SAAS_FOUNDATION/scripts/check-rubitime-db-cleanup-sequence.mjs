#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const HELP = `Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-db-cleanup-sequence.mjs

Checks the repo-first Rubitime DB cleanup sequence package. Static only: no DB,
env, SSH, service, webhook, pg_dump, pg_restore, psql, or migration is run.`;

const sequenceDoc = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md';
const r7Runbook = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md';
const dispositionDoc = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md';
const finalGateManifest = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_FINAL_GATE_MANIFEST.md';
const ownerGatePacket = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_OWNER_GATE_PACKET.md';
const onePassScript = 'docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-db-cleanup-one-pass.mjs';

const requiredSequenceFragments = [
  'repo-first, non-production DB cleanup sequence',
  'one-pass fresh-copy/TEST cleanup package',
  'One-Pass Entrypoints',
  'rubitime-db-cleanup-one-pass.mjs',
  'rubitime:db-cleanup:one-pass',
  'deploy-test-saas.sh feat/doctor-ui-rebuild',
  'scripts/deploy-saas-667.sh',
  'does not approve production changes',
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
  'refusing unsafe production-like database',
  'No ad hoc',
  'r7DropStatus',
];

const requiredTables = [
  'public.appointment_records',
  'integrator.rubitime_records',
  'integrator.rubitime_events',
  'integrator.rubitime_api_throttle',
  'integrator.rubitime_create_retry_jobs',
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
};

console.log(JSON.stringify(result, null, 2));

if (errors.length > 0) {
  console.error('check-rubitime-db-cleanup-sequence: FAILED');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('check-rubitime-db-cleanup-sequence: OK');

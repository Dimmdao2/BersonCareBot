#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const HELP = `Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-r7-table-disposition.mjs [--require-drop-ready]

Checks the documented R7 keep/archive/drop table disposition and final proof
contract. It is static only: no DB, env, SSH, pg_dump, or migration is executed.

--require-drop-ready fails until the required R6 and R7 proof files exist and
the R7 proof contains the required archive/drop/restore evidence sections.`;

const runbook = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md';
const dispositionDoc = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md';
const r6Proof = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md';
const r7Proof = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md';

const keep = [
  {
    table: 'public.patient_bookings',
    decision: 'keep',
    reason: 'canonical patient booking history/runtime table, not Rubitime raw history',
  },
  {
    table: 'public.be_external_entity_mappings',
    decision: 'keep',
    reason: 'canonical external identity/mapping table; only Rubitime rows are later traceability policy scope',
  },
  {
    table: 'integrator.booking_calendar_map',
    decision: 'keep_until_replacement',
    reason: 'active provider-neutral Google Calendar map while GCal sync is live',
  },
  {
    table: 'public.booking_*',
    decision: 'defer_drop',
    reason: 'legacy public catalog compatibility; not dropped by Rubitime raw-table retirement',
  },
];

const archiveBeforeDrop = [
  'public.appointment_records',
  'integrator.rubitime_records',
  'integrator.rubitime_events',
  'public.rubitime_records',
  'public.rubitime_events',
];

const dropCandidates = [
  'integrator.rubitime_api_throttle',
  'integrator.rubitime_create_retry_jobs',
  'integrator.rubitime_booking_profiles',
  'integrator.rubitime_branches',
  'integrator.rubitime_services',
  'integrator.rubitime_cooperators',
];

const r7ProofRequiredFragments = [
  'R6 proof link and commit hash',
  'owner archive/drop decision',
  'schema audit JSON',
  'post-R6 static reference audit',
  'archive directory and SHA256SUMS',
  'raw archive is archive-only; it must not resurrect integrator-only rows absent from CSV',
  'integrator-led reconciliation is forbidden when the fresh CSV exists',
  'migration file name or explicit defer record',
  'fresh restore + migrate output',
  'typecheck/lint/test output',
  'explicit rollback horizon',
];

function readRel(rel) {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8');
}

function requireMention(errors, src, rel, value) {
  if (!src?.includes(value)) errors.push(`${rel}: missing ${value}`);
}

function requireFinalProof(errors) {
  const r6ProofSrc = readRel(r6Proof);
  const r7ProofSrc = readRel(r7Proof);

  if (!r6ProofSrc) {
    errors.push(`missing ${r6Proof}`);
  }
  if (!r7ProofSrc) {
    errors.push(`missing ${r7Proof}`);
    return;
  }

  for (const fragment of r7ProofRequiredFragments) {
    requireMention(errors, r7ProofSrc, r7Proof, fragment);
  }
  if (r7ProofSrc.includes('TODO:')) {
    errors.push(`${r7Proof}: contains TODO placeholders`);
  }
  requireMention(errors, r7ProofSrc, r7Proof, 'RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md');
}

if (process.argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

const errors = [];
const runbookSrc = readRel(runbook);
const dispositionSrc = readRel(dispositionDoc);

if (!runbookSrc) errors.push(`missing ${runbook}`);
if (!dispositionSrc) errors.push(`missing ${dispositionDoc}`);

for (const item of keep) {
  requireMention(errors, runbookSrc, runbook, item.table);
  requireMention(errors, dispositionSrc, dispositionDoc, item.table);
  requireMention(errors, dispositionSrc, dispositionDoc, item.decision);
}

for (const table of archiveBeforeDrop) {
  requireMention(errors, dispositionSrc, dispositionDoc, table);
}

for (const table of dropCandidates) {
  requireMention(errors, runbookSrc, runbook, table);
  requireMention(errors, dispositionSrc, dispositionDoc, table);
}

if (process.argv.includes('--require-drop-ready')) {
  requireFinalProof(errors);
}

const result = {
  runbook,
  dispositionDoc,
  r6Proof,
  r7Proof,
  keep,
  archiveBeforeDrop,
  dropCandidates,
  r7ProofRequiredFragments,
  requireDropReady: process.argv.includes('--require-drop-ready'),
};

console.log(JSON.stringify(result, null, 2));

if (errors.length > 0) {
  console.error('check-rubitime-r7-table-disposition: FAILED');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('check-rubitime-r7-table-disposition: OK');

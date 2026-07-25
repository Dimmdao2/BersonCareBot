#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const HELP = `Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-r7-table-disposition.mjs [--require-drop-ready]

Checks the documented R7 keep/archive/drop table disposition and final proof
contract. It is static only: no DB, env, SSH, pg_dump, or migration is executed.

It also verifies the B-7(b) archive-then-drop tooling against the docs:
deploy/host/archive-rubitime-retirement-tables.sh must target exactly the
documented archive-before-drop table list and carry the explicit safety gate, and
apps/webapp/db/drizzle-migrations/0237_r7_drop_public_rubitime_mirror_tables.sql
must drop only the authorized public rubitime mirrors -- never
public.appointment_records and never a KEEP-list table.

--require-drop-ready fails until the required R6 and R7 proof files exist and
the R7 proof contains the required archive/drop/restore evidence sections.`;

const runbook = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md';
const dispositionDoc = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md';
const cleanupSequenceDoc = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md';
const r6Proof = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md';
const r7Proof = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md';

// B-7(b) tooling that replaced the prose-only archive block of the runbook (§3).
const archiveScript = 'deploy/host/archive-rubitime-retirement-tables.sh';
const dropMigration = 'apps/webapp/db/drizzle-migrations/0237_r7_drop_public_rubitime_mirror_tables.sql';

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
  'integrator.rubitime_booking_profiles',
  'integrator.rubitime_branches',
  'integrator.rubitime_services',
  'integrator.rubitime_cooperators',
];

// Tables the archive script and the new drop migration must NEVER name as a target.
// Runbook "Non-Negotiable Keep List" + the disposition Keep/Defer table.
const keepListTables = [
  'public.patient_bookings',
  'public.be_external_entity_mappings',
  'integrator.booking_calendar_map',
  'integrator.message_retry_jobs',
];

// The ONLY tables migration 0237 is authorized to drop: the legacy public rubitime mirrors
// (DB_CLEANUP_SEQUENCE.md "Archive-before-drop tables" -> `archive_if_present`).
// `public.appointment_records` is explicitly excluded: the runbook forbids dropping it while runtime
// references exist, and the disposition doc rules "KEEP for now, ARCHIVE+DROP deferred".
const authorizedMirrorDrops = ['public.rubitime_records', 'public.rubitime_events'];
const forbiddenDrops = ['public.appointment_records', ...keepListTables];

// Safety-gate tokens the archive script must carry (same explicit-flag shape as
// deploy/postgres/test-strict-rls-finalizer.sql and apps/webapp/scripts/purge-placeholder-bookings-safety.ts).
const archiveScriptRequiredTokens = [
  '--execute',
  '--expected-database',
  'refusing_expected_database_mismatch',
  'refusing_live_like_database',
  '--allow-authorized-prod-target',
  'refusing_authorized_prod_target_without_expected_database',
  'refusing_authorized_prod_target_mismatch',
  'refusing_non_loopback_database_host',
  'refusing_archive_dir_inside_repo',
  'SHA256SUMS',
  'ARCHIVE VERIFIED',
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

/**
 * Parses the doc-derived ARCHIVE_TARGETS bash array out of the archive script so the executable
 * target list can be verified against this gate's doc-derived list instead of being trusted.
 */
function parseArchiveScriptTargets(src) {
  const match = /\nARCHIVE_TARGETS=\(\n([\s\S]*?)\n\)\n/.exec(src);
  if (!match) return null;
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const quoted = /^"([^"]+)"$/.exec(line);
      return quoted ? quoted[1] : line;
    });
}

/** Returns every `schema.table` named by a DROP TABLE statement in the migration. */
function parseDroppedTables(src) {
  const dropped = [];
  const pattern = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)/gi;
  let hit;
  while ((hit = pattern.exec(src)) !== null) dropped.push(hit[1].toLowerCase());
  return dropped;
}

/**
 * B-7(b): the archive-then-drop tooling must exist, must target exactly the doc-derived
 * archive-before-drop list, must carry the explicit safety gate, and its drop migration must be
 * narrower than the archive list (no `appointment_records`, no KEEP-list table).
 */
function checkArchiveDropTooling(errors) {
  const archiveSrc = readRel(archiveScript);
  const migrationSrc = readRel(dropMigration);

  if (!archiveSrc) {
    errors.push(`missing ${archiveScript}`);
  } else {
    const targets = parseArchiveScriptTargets(archiveSrc);
    if (!targets) {
      errors.push(`${archiveScript}: could not parse the ARCHIVE_TARGETS list`);
    } else if (targets.join('|') !== archiveBeforeDrop.join('|')) {
      errors.push(
        `${archiveScript}: ARCHIVE_TARGETS (${targets.join(', ')}) does not match the documented ` +
          `archive-before-drop list (${archiveBeforeDrop.join(', ')})`,
      );
    }
    for (const token of archiveScriptRequiredTokens) {
      requireMention(errors, archiveSrc, archiveScript, token);
    }
    for (const table of keepListTables) {
      if (parseArchiveScriptTargets(archiveSrc)?.includes(table)) {
        errors.push(`${archiveScript}: KEEP-list table ${table} must never be an archive target`);
      }
    }
    // The archive script must hand the drop off to the repo migration, never DROP by itself.
    // Matches a terminated SQL statement (`DROP TABLE ... ;`) rather than any mention of the words,
    // so the script may still *document* that it never drops anything.
    if (/^[^#\n]*\bDROP\s+TABLE\b[^\n;]*;/im.test(archiveSrc)) {
      errors.push(`${archiveScript}: contains an executable DROP TABLE; the drop must go through a repo migration`);
    }
    requireMention(errors, archiveSrc, archiveScript, dropMigration);
  }

  if (!migrationSrc) {
    errors.push(`missing ${dropMigration}`);
    return;
  }
  const dropped = parseDroppedTables(migrationSrc);
  if (dropped.join('|') !== authorizedMirrorDrops.join('|')) {
    errors.push(
      `${dropMigration}: drops (${dropped.join(', ') || 'nothing'}) but only ` +
        `${authorizedMirrorDrops.join(', ')} are authorized`,
    );
  }
  for (const table of forbiddenDrops) {
    if (dropped.includes(table)) {
      errors.push(`${dropMigration}: must never drop ${table}`);
    }
  }
  if (!/DROP\s+TABLE\s+IF\s+EXISTS/i.test(migrationSrc)) {
    errors.push(`${dropMigration}: drops must be IF EXISTS (idempotent re-deploy safety)`);
  }
  const journal = readRel('apps/webapp/db/drizzle-migrations/meta/_journal.json');
  const tag = dropMigration.replace(/^.*\//, '').replace(/\.sql$/, '');
  if (!journal?.includes(`"tag": "${tag}"`)) {
    errors.push(`apps/webapp/db/drizzle-migrations/meta/_journal.json: missing entry for ${tag}`);
  }
}

if (process.argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

const errors = [];
const runbookSrc = readRel(runbook);
const dispositionSrc = readRel(dispositionDoc);
const cleanupSequenceSrc = readRel(cleanupSequenceDoc);

if (!runbookSrc) errors.push(`missing ${runbook}`);
if (!dispositionSrc) errors.push(`missing ${dispositionDoc}`);
if (!cleanupSequenceSrc) errors.push(`missing ${cleanupSequenceDoc}`);

for (const item of keep) {
  requireMention(errors, runbookSrc, runbook, item.table);
  requireMention(errors, dispositionSrc, dispositionDoc, item.table);
  requireMention(errors, dispositionSrc, dispositionDoc, item.decision);
}

for (const table of archiveBeforeDrop) {
  requireMention(errors, dispositionSrc, dispositionDoc, table);
  // The executable target list is derived from the cleanup-sequence archive-candidate list, so that
  // doc must keep naming every table the script dumps.
  requireMention(errors, cleanupSequenceSrc, cleanupSequenceDoc, table);
}

checkArchiveDropTooling(errors);

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
  cleanupSequenceDoc,
  r6Proof,
  r7Proof,
  keep,
  archiveBeforeDrop,
  dropCandidates,
  keepListTables,
  archiveDropTooling: {
    archiveScript,
    dropMigration,
    archiveScriptTargets: parseArchiveScriptTargets(readRel(archiveScript) ?? '') ?? null,
    authorizedMirrorDrops,
    migrationDroppedTables: parseDroppedTables(readRel(dropMigration) ?? ''),
    forbiddenDrops,
  },
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

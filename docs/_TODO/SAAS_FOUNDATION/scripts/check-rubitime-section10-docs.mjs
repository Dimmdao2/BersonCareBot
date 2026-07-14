#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const HELP = `Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-section10-docs.mjs

Checks that every Rubitime retirement section-10 document has either a current
update or an explicit follow-up assignment in the section-10 manifest.`;

const manifest = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_SECTION10_DOCS_MANIFEST.md';

const section10Docs = [
  {
    path: 'docs/_TODO/SAAS_FOUNDATION/TENANT_HARD_MODE_EXECUTION_PLAN.md',
    requiredDisposition: 'follow_up_after_r6_r7',
  },
  {
    path: 'docs/_TODO/SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_INVENTORY.md',
    requiredDisposition: 'follow_up_after_r6_r7',
  },
  {
    path: 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/t0-4-pre-table-matrix.tsv',
    requiredDisposition: 'follow_up_after_r7',
  },
  {
    path: 'docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md',
    requiredDisposition: 'follow_up_after_r6',
  },
  {
    path: 'docs/OPERATIONS/BOOKING_CANONICAL_CUTOVER.md',
    requiredDisposition: 'updated_with_retirement_entrypoint',
  },
  {
    path: 'docs/ARCHITECTURE/DB_STRUCTURE.md',
    requiredDisposition: 'follow_up_after_r7',
  },
];

function readRel(rel) {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8');
}

if (process.argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

const errors = [];
const manifestSrc = readRel(manifest);
if (!manifestSrc) {
  errors.push(`missing ${manifest}`);
} else {
  for (const item of section10Docs) {
    if (!existsSync(join(repoRoot, item.path))) {
      errors.push(`missing section-10 doc ${item.path}`);
      continue;
    }
    if (!manifestSrc.includes(item.path)) {
      errors.push(`${manifest}: missing ${item.path}`);
    }
    if (!manifestSrc.includes(item.requiredDisposition)) {
      errors.push(`${manifest}: missing disposition ${item.requiredDisposition}`);
    }
  }
}

console.log(JSON.stringify({ manifest, section10Docs }, null, 2));

if (errors.length > 0) {
  console.error('check-rubitime-section10-docs: FAILED');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('check-rubitime-section10-docs: OK');

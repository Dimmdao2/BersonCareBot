#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const HELP = `Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-retirement-proofs.mjs [--require-complete]

Checks the RR-PROOF-01..10 artifact manifest. Default mode verifies that every
closed proof points to existing files and every pending proof has a gate/runbook.
Pending proofs are treated as pass only after their expected proof file exists.
--require-complete additionally fails while any proof remains pending.`;

const proofs = [
  {
    id: 'RR-PROOF-01-DUAL-SOURCE',
    status: 'pass',
    phase: 'R1 before R2',
    artifacts: [
      'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_REPORT.md',
      'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_OWNER_REVIEW_PACKET.md',
      'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEAN_DUMP_REHEARSAL.md',
      'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DOCTOR_UI_SMOKE.md',
    ],
    note: 'Fresh Rubitime CSV is canon; integrator-only rows absent from CSV are audit-only.',
  },
  {
    id: 'RR-PROOF-02-STATE-HISTORY',
    status: 'pass',
    phase: 'R1 before R2',
    artifacts: ['docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_STATE_HISTORY_PROOF.md'],
    note: 'Canonical state/history event proof saved; raw provider events remain archive-only until R7.',
  },
  {
    id: 'RR-PROOF-03-NO-RUBITIME-SLOTS-CREATE',
    status: 'pass',
    phase: 'R3 before R5',
    artifacts: ['docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R3_SLOTS_CREATE_PROOF.md'],
    note: 'Patient/public slots/create are canonical-only in code.',
  },
  {
    id: 'RR-PROOF-04-EXACT-TENANT',
    status: 'pass',
    phase: 'R3 tenant',
    artifacts: ['docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R3_TENANT_PROOF.md'],
    note: 'Patient/public booking tenant derives from resource/context, not default org.',
  },
  {
    id: 'RR-PROOF-05-CATALOG-CUTOVER',
    status: 'pass',
    phase: 'R3 catalog',
    artifacts: ['docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R3_CATALOG_PROOF.md'],
    note: 'Patient/public runtime no longer reads public legacy booking catalog tables.',
  },
  {
    id: 'RR-PROOF-06-LIFECYCLE-PARITY',
    status: 'pass',
    phase: 'R4 before R6',
    artifacts: ['docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R4_LIFECYCLE_PROOF.md'],
    note: 'Provider-neutral lifecycle side effects are covered by parity tests.',
  },
  {
    id: 'RR-PROOF-07-GCAL-REKEY',
    status: 'pass',
    phase: 'R4 before R6',
    artifacts: ['docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R4_LIFECYCLE_PROOF.md'],
    note: 'Canonical lifecycle uses be:* booking_calendar_map keys and adopts legacy Rubitime map rows.',
  },
  {
    id: 'RR-PROOF-08-IDEMPOTENCY',
    status: 'pass',
    phase: 'R4 before R6',
    artifacts: ['docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R4_LIFECYCLE_PROOF.md'],
    note: 'Persistent lifecycle idempotency is proven across Fastify app instances.',
  },
  {
    id: 'RR-PROOF-09-CUTOFF-DRAIN',
    status: 'pending',
    phase: 'R6',
    artifacts: [
      'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md',
      'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_R7_STATIC_INVENTORY.md',
    ],
    expectedProof: 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md',
    gate: 'owner-approved provider cutoff/drain and fresh post-cutoff CSV reconciliation',
  },
  {
    id: 'RR-PROOF-10-DROP-RESTORE',
    status: 'pending',
    phase: 'R7',
    artifacts: [
      'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md',
      'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md',
    ],
    expectedProof: 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md',
    gate: 'R1-R6 complete, owner archive/drop decision, archive export, migration restore proof',
  },
];

function fileExists(rel) {
  return existsSync(join(repoRoot, rel));
}

function materializeProofs() {
  return proofs.map((proof) => {
    if (proof.status !== 'pending' || !proof.expectedProof || !fileExists(proof.expectedProof)) {
      return proof;
    }
    return {
      ...proof,
      status: 'pass',
      artifacts: [...proof.artifacts, proof.expectedProof],
      note: `Completed by expected proof ${proof.expectedProof}.`,
    };
  });
}

function validate(materializedProofs) {
  const errors = [];
  for (const proof of materializedProofs) {
    for (const rel of proof.artifacts) {
      if (!fileExists(rel)) {
        errors.push(`${proof.id}: missing artifact ${rel}`);
      }
    }
    if (proof.status === 'pending') {
      if (!proof.gate || !proof.expectedProof) {
        errors.push(`${proof.id}: pending proof must declare gate and expectedProof`);
      }
    } else if (proof.status !== 'pass') {
      errors.push(`${proof.id}: unsupported status ${proof.status}`);
    }
  }

  if (process.argv.includes('--require-complete')) {
    for (const proof of materializedProofs) {
      if (proof.status !== 'pass') {
        errors.push(`${proof.id}: still ${proof.status}; gate=${proof.gate ?? 'n/a'}`);
        if (proof.expectedProof && !fileExists(proof.expectedProof)) {
          errors.push(`${proof.id}: missing expected proof ${proof.expectedProof}`);
        }
      }
    }
  }

  return errors;
}

if (process.argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

const materializedProofs = materializeProofs();
const errors = validate(materializedProofs);
console.log(JSON.stringify({ proofs: materializedProofs, requireComplete: process.argv.includes('--require-complete') }, null, 2));

if (errors.length > 0) {
  console.error('check-rubitime-retirement-proofs: FAILED');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log('check-rubitime-retirement-proofs: OK');

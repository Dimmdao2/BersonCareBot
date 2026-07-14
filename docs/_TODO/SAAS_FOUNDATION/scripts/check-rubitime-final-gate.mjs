#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const HELP = `Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-final-gate.mjs [--require-complete]

Default mode verifies that every current Rubitime retirement final-gate blocker
has an explicit expected proof and owner/ops gate. --require-complete fails
until every blocker has a real proof file and the final checklist is checked.`;

const manifest = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_FINAL_GATE_MANIFEST.md';
const executionPlan = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md';
const ownerGatePacket = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_OWNER_GATE_PACKET.md';
const agentReadme = 'docs/OPERATIONS/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md';

const expectedProofs = [
  'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.md',
  'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md',
  'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md',
];

const proofContracts = [
  {
    proof: expectedProofs[0],
    template: 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.template.md',
    requiredFragments: [
      'production flag-change timestamp',
      'monitoring window start/end',
      'v1 `/api/bersoncare/rubitime/slots` request count',
      'v1 `/api/bersoncare/rubitime/create-record` request count',
      'source of aggregate counts without secrets or PII',
      'owner approval note',
      'rollback notes',
    ],
  },
  {
    proof: expectedProofs[1],
    template: 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.template.md',
    requiredFragments: [
      'backup filename',
      'read-only drain snapshot',
      'runtime Rubitime traffic snapshot before/after disable',
      'fresh CSV filename, size, date span and reconciliation output',
      'fresh CSV is canon; integrator-only rows absent from CSV are audit-only',
      'owner waivers, if any',
      'route/code removal commit hash',
      'pre/post `rubitime-r6-r7-static-inventory.mjs` outputs',
      'validation commands and results',
    ],
  },
  {
    proof: expectedProofs[2],
    template: 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.template.md',
    requiredFragments: [
      'R6 proof link and commit hash',
      'owner archive/drop decision',
      'schema audit JSON',
      'post-R6 static reference audit',
      'archive directory and SHA256SUMS',
      'raw archive is archive-only; it must not resurrect integrator-only rows absent from CSV',
      'migration file name or explicit defer record',
      'fresh restore + migrate output',
      'typecheck/lint/test output',
      'explicit rollback horizon',
    ],
  },
];

const forbiddenProofFragments = [
  'TODO:',
  'Do not rename this template',
  'Final proof filename:',
];

const blockingItems = [
  {
    id: 'R5-PROD-DISABLE',
    status: 'gated',
    checklistText: 'R5 legacy v1 resolve disabled in production.',
    expectedProof: expectedProofs[0],
    gate: 'owner-approved production flag change and monitoring window',
  },
  {
    id: 'R6-RUNTIME-REMOVAL',
    status: 'gated',
    checklistText: 'R6 runtime routes/code removed.',
    expectedProof: expectedProofs[1],
    gate: 'owner-approved provider cutoff/drain and fresh post-cutoff CSV reconciliation',
  },
  {
    id: 'R7-ARCHIVE-DROP',
    status: 'gated',
    checklistText: 'R7 archive/drop complete or explicitly deferred with no runtime references.',
    expectedProof: expectedProofs[2],
    gate: 'owner archive/drop decision, archive export and restore/migrate proof',
  },
  {
    id: 'NO-RUNTIME-RUBITIME-API',
    status: 'gated',
    checklistText: 'No runtime code calls Rubitime API.',
    expectedProof: expectedProofs[1],
    gate: 'post-R6 static inventory and runtime route/code removal proof',
  },
  {
    id: 'NO-RUBITIME-PROVIDER-ROUTE',
    status: 'gated',
    checklistText: 'No runtime route accepts Rubitime webhook/provider traffic.',
    expectedProof: expectedProofs[1],
    gate: 'post-R6 route unmount proof',
  },
  {
    id: 'ONLY-PROVIDER-NEUTRAL-LIFECYCLE-ROUTE',
    status: 'gated',
    checklistText: 'provider-neutral booking lifecycle route is the only live lifecycle integration route.',
    expectedProof: expectedProofs[1],
    gate: 'Rubitime lifecycle compatibility alias removed after cutoff/drain',
  },
  {
    id: 'ALL-RR-PROOFS-SAVED',
    status: 'gated',
    checklistText: 'all `RR-PROOF-*` artifacts are saved.',
    expectedProof: expectedProofs[2],
    gate: 'RR-PROOF-09 and RR-PROOF-10 completed',
  },
  {
    id: 'PRODUCTION-ROLLBACK-BOUNDARY-ACCEPTED',
    status: 'gated',
    checklistText: 'production rollback boundary is accepted by owner.',
    expectedProof: expectedProofs[2],
    gate: 'owner accepts rollback horizon in R5/R6/R7 proof files',
  },
];

function relExists(rel) {
  return existsSync(join(repoRoot, rel));
}

function readRel(rel) {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8');
}

function materializeBlockingItems() {
  return blockingItems.map((item) => ({
    ...item,
    status: relExists(item.expectedProof) ? 'pass' : item.status,
  }));
}

function validate({ requireComplete }) {
  const errors = [];
  const manifestSrc = readRel(manifest);
  const executionPlanSrc = readRel(executionPlan);
  const ownerGatePacketSrc = readRel(ownerGatePacket);
  const agentReadmeSrc = readRel(agentReadme);

  if (!manifestSrc) {
    errors.push(`missing ${manifest}`);
    return errors;
  }
  if (!executionPlanSrc) {
    errors.push(`missing ${executionPlan}`);
    return errors;
  }
  if (!ownerGatePacketSrc) {
    errors.push(`missing ${ownerGatePacket}`);
    return errors;
  }
  if (!agentReadmeSrc) {
    errors.push(`missing ${agentReadme}`);
    return errors;
  }

  for (const proof of expectedProofs) {
    if (!manifestSrc.includes(proof)) {
      errors.push(`${manifest}: missing expected proof ${proof}`);
    }
    if (!ownerGatePacketSrc.includes(proof)) {
      errors.push(`${ownerGatePacket}: missing expected proof ${proof}`);
    }
  }

  for (const contract of proofContracts) {
    const templateSrc = readRel(contract.template);
    if (!templateSrc) {
      errors.push(`${contract.template}: missing proof template`);
    } else {
      for (const fragment of contract.requiredFragments) {
        if (!templateSrc.includes(fragment)) {
          errors.push(`${contract.template}: missing required fragment ${fragment}`);
        }
      }
    }
    const proofSrc = readRel(contract.proof);
    if (proofSrc || requireComplete) {
      if (!proofSrc) {
        errors.push(`${contract.proof}: missing proof file`);
        continue;
      }
      for (const fragment of contract.requiredFragments) {
        if (!proofSrc.includes(fragment)) {
          errors.push(`${contract.proof}: missing required fragment ${fragment}`);
        }
      }
      for (const fragment of forbiddenProofFragments) {
        if (proofSrc.includes(fragment)) {
          errors.push(`${contract.proof}: contains placeholder/template fragment ${fragment}`);
        }
      }
    }
    for (const fragment of contract.requiredFragments) {
      if (!ownerGatePacketSrc.includes(fragment)) {
        errors.push(`${ownerGatePacket}: missing proof-contract fragment ${fragment}`);
      }
    }
  }

  const requiredCanonFragmentsByDoc = [
    [
      manifest,
      manifestSrc,
      [
        'Fresh Rubitime CSV decides the preservation set',
        '89643805480',
        '9643805480',
        'matched through existing city/branch mappings',
        'integrator.rubitime_records` is audit-only',
        'Integrator-only rows absent from the fresh CSV must not be imported',
        'Extra rows present only in `integrator.rubitime_records` do not expand the preservation set',
        'new backfill',
      ],
    ],
    [
      ownerGatePacket,
      ownerGatePacketSrc,
      [
        'Fresh Rubitime CSV decides the preservation set',
        '89643805480',
        '9643805480',
        'matched through existing city/branch mappings',
        'integrator.rubitime_records` is audit-only',
        'Integrator-only rows absent from the fresh CSV must not be imported',
        'Extra rows present only in `integrator.rubitime_records` do not expand the preservation set',
        'new backfill',
      ],
    ],
    [
      executionPlan,
      executionPlanSrc,
      [
        'fresh Rubitime CSV decides record preservation',
        '89643805480',
        '9643805480',
        'matched through existing city/branch mappings',
        'integrator.rubitime_records` is audit-only',
        'Integrator-only rows absent from the fresh CSV must not be imported',
        'Extra rows present only in `integrator.rubitime_records` do not expand',
        'new backfill',
      ],
    ],
    [
      agentReadme,
      agentReadmeSrc,
      [
        'канон состава записей — свежая выгрузка Rubitime CSV',
        '89643805480',
        '9643805480',
        '`integrator.rubitime_records` — только audit/diagnostic material',
        'они не расширяют preservation set',
        'не повод для нового backfill',
      ],
    ],
  ];
  for (const [doc, src, fragments] of requiredCanonFragmentsByDoc) {
    for (const fragment of fragments) {
      if (!src.includes(fragment)) {
        errors.push(`${doc}: missing data-canon fragment ${fragment}`);
      }
    }
  }

  const materializedBlockingItems = materializeBlockingItems();
  for (const item of materializedBlockingItems) {
    if (!item.expectedProof || !item.gate) {
      errors.push(`${item.id}: missing expectedProof or gate`);
    }
    if (!item.checklistText) {
      errors.push(`${item.id}: missing checklistText`);
    }
    if (!manifestSrc.includes(item.id)) {
      errors.push(`${manifest}: missing blocker ${item.id}`);
    }
    const uncheckedLine = `- [ ] ${item.checklistText}`;
    const checkedLine = `- [x] ${item.checklistText}`;
    if (!executionPlanSrc.includes(uncheckedLine) && !executionPlanSrc.includes(checkedLine)) {
      errors.push(`${executionPlan}: missing final checklist line ${item.checklistText}`);
    }
    if (requireComplete) {
      if (item.status !== 'pass') {
        errors.push(`${item.id}: still ${item.status}; gate=${item.gate}`);
      }
      if (!relExists(item.expectedProof)) {
        errors.push(`${item.id}: missing final proof ${item.expectedProof}`);
      }
      if (item.status === 'pass' && !executionPlanSrc.includes(checkedLine)) {
        errors.push(`${item.id}: final checklist is not checked`);
      }
    } else if (item.status === 'pass' && !relExists(item.expectedProof)) {
      errors.push(`${item.id}: status pass but proof is missing ${item.expectedProof}`);
    } else if (item.status !== 'gated' && item.status !== 'pass') {
      errors.push(`${item.id}: unsupported status ${item.status}`);
    } else if (item.status === 'gated' && executionPlanSrc.includes(checkedLine)) {
      errors.push(`${item.id}: final checklist is checked while gate is still open`);
    }
  }

  return errors;
}

if (process.argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

const requireComplete = process.argv.includes('--require-complete');
const materializedBlockingItems = materializeBlockingItems();
const errors = validate({ requireComplete });

console.log(
  JSON.stringify(
    {
      manifest,
      executionPlan,
      ownerGatePacket,
      agentReadme,
      expectedProofs,
      proofContracts,
      blockingItems: materializedBlockingItems,
      requireComplete,
    },
    null,
    2,
  ),
);

if (errors.length > 0) {
  console.error('check-rubitime-final-gate: FAILED');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('check-rubitime-final-gate: OK');

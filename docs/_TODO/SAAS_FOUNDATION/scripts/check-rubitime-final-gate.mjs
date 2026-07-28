#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const HELP = `Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-final-gate.mjs [--self-test] [--require-complete]

Default mode verifies that every current Rubitime retirement final-gate blocker
has an explicit expected proof and owner/ops gate. --require-complete fails
until every blocker has a real proof file and the final checklist is checked.
--self-test validates the current R5 TEST-negative-route contract with an in-memory proof fixture.`;

const manifest = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_FINAL_GATE_MANIFEST.md';
const executionPlan = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md';
const ownerGatePacket = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_OWNER_GATE_PACKET.md';
const agentReadme = 'docs/OPERATIONS/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md';
const r5Runbook = 'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_RUNBOOK.md';

const expectedProofs = [
  'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.md',
  'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md',
  'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md',
];

const proofContracts = [
  {
    proof: expectedProofs[0],
    template:
      'docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.template.md',
    requiredFragments: [
      'TEST integrated SHA and declared monitoring-window start/end',
      'aggregate v1 `/api/bersoncare/rubitime/slots` request count',
      'aggregate v1 `/api/bersoncare/rubitime/create-record` request count',
      'TEST negative/unmounted result for the retired v1 routes, without assuming `legacy_resolve_disabled`',
      'canonical slots/create/reschedule/cancel and doctor Today/KPI/calendar/list smoke',
      'aggregate-only source of route/error counts without secrets or PII',
      'incremental code rollback boundary, if tested, without re-enabling the removed resolver',
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
      'integrator-led reconciliation is forbidden when the fresh CSV exists',
      'one-specialist context: `89643805480` / tail `9643805480`',
      'matched through existing city/branch mappings',
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
      'integrator-led reconciliation is forbidden when the fresh CSV exists',
      'migration file name or explicit defer record',
      'fresh restore + migrate output',
      'typecheck/lint/test output',
      'explicit rollback horizon',
    ],
  },
];

const forbiddenProofFragments = ['TODO:', 'Do not rename this template', 'Final proof filename:'];

const blockingItems = [
  {
    id: 'R5-TEST-NEGATIVE-ROUTES',
    status: 'gated',
    checklistText: 'R5 TEST retired v1 routes negative/unmounted; canonical booking healthy.',
    expectedProof: expectedProofs[0],
    gate: 'declared TEST window, negative/unmounted route proof, aggregate-only counts and canonical booking smoke',
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
    checklistText:
      'provider-neutral booking lifecycle route is the only live lifecycle integration route.',
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
    id: 'LIVE-ROLLBACK-BOUNDARY-ACCEPTED',
    status: 'gated',
    checklistText: 'live rollback boundary is accepted by owner.',
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

function materializeBlockingItems(exists = relExists) {
  return blockingItems.map((item) => ({
    ...item,
    status: exists(item.expectedProof) ? 'pass' : item.status,
  }));
}

function validate({ requireComplete, exists = relExists, read = readRel }) {
  const errors = [];
  const manifestSrc = read(manifest);
  const executionPlanSrc = read(executionPlan);
  const ownerGatePacketSrc = read(ownerGatePacket);
  const agentReadmeSrc = read(agentReadme);
  const r5RunbookSrc = read(r5Runbook);

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
  if (!r5RunbookSrc) {
    errors.push(`missing ${r5Runbook}`);
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

  const r5RunbookFragments = [
    'Current Track C status — non-executable historical reference',
    'no flag is set or restored, no PROD env or service is changed',
    'Current R5 TEST acceptance is still **open**',
    'R5 is not complete and is not awaiting PROD monitoring.',
  ];
  for (const fragment of r5RunbookFragments) {
    if (!r5RunbookSrc.includes(fragment)) {
      errors.push(`${r5Runbook}: missing runbook fragment ${fragment}`);
    }
  }

  for (const contract of proofContracts) {
    const templateSrc = read(contract.template);
    if (!templateSrc) {
      errors.push(`${contract.template}: missing proof template`);
    } else {
      for (const fragment of contract.requiredFragments) {
        if (!templateSrc.includes(fragment)) {
          errors.push(`${contract.template}: missing required fragment ${fragment}`);
        }
      }
    }
    const proofSrc = read(contract.proof);
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
        'Integrator-led reconciliation is forbidden when the fresh CSV exists',
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
        'Integrator-led reconciliation is forbidden when the fresh CSV exists',
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
        'integrator-led reconciliation is forbidden',
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
        'integrator-led reconciliation запрещен',
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

  if (!manifestSrc.includes('R5-TEST-NEGATIVE-ROUTES') || !manifestSrc.includes('`gated`')) {
    errors.push(`${manifest}: missing active R5 TEST-negative-route blocker`);
  }
  if (!manifestSrc.includes('R5-LIVE-DISABLE') || !manifestSrc.includes('`superseded`')) {
    errors.push(`${manifest}: missing superseded R5 live-disable record`);
  }

  const materializedBlockingItems = materializeBlockingItems(exists);
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
      if (!exists(item.expectedProof)) {
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
const selfTest = process.argv.includes('--self-test');
const materializedBlockingItems = materializeBlockingItems();
const errors = validate({ requireComplete });

if (selfTest) {
  const r5Proof = expectedProofs[0];
  const missingR5Errors = validate({ requireComplete: true });
  const virtualR5Proof = proofContracts[0].requiredFragments.join('\n');
  const r5FixtureErrors = validate({
    requireComplete: true,
    exists: (rel) => rel === r5Proof || relExists(rel),
    read: (rel) => (rel === r5Proof ? virtualR5Proof : readRel(rel)),
  });
  if (!blockingItems.some((item) => item.id === 'R5-TEST-NEGATIVE-ROUTES')) {
    errors.push('self-test: R5 TEST-negative-route blocker is absent');
  }
  if (blockingItems.some((item) => item.id === 'R5-LIVE-DISABLE')) {
    errors.push('self-test: superseded R5 live-disable contract is still an active blocker');
  }
  if (!missingR5Errors.some((error) => error.includes('R5-TEST-NEGATIVE-ROUTES'))) {
    errors.push('self-test: incomplete gate did not fail for missing R5 TEST proof');
  }
  if (
    r5FixtureErrors.some((error) => error.includes('R5-TEST-NEGATIVE-ROUTES: missing final proof'))
  ) {
    errors.push('self-test: current R5 virtual TEST proof was not recognized');
  }
}

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

if (selfTest) console.log('check-rubitime-final-gate: self-test OK');
console.log('check-rubitime-final-gate: OK');

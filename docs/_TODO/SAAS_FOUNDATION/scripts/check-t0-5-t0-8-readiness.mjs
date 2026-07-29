#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

const files = {
  review: 'docs/_TODO/SAAS_FOUNDATION/T0_5_T0_8_READINESS_REVIEW.md',
  checklist: 'docs/archive/2026-07-plans/SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md',
  log: 'docs/_TODO/SAAS_FOUNDATION/LOG.md',
  accessSurface: 'docs/_TODO/SAAS_FOUNDATION/T0_DB_ACCESS_SURFACE.md',
  entrypointMap: 'docs/_TODO/SAAS_FOUNDATION/T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md',
  rubitimeAudit: 'docs/_TODO/SAAS_FOUNDATION/T0_4_RUBITIME_APPOINTMENT_ORG_AUDIT.md',
  systemSettingsChecklist: 'docs/archive/2026-07-plans/SAAS_FOUNDATION/P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md',
  p08CodeFacts: 'docs/_TODO/SAAS_FOUNDATION/P0_8_CODE_FACTS.md',
};

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function assertContains(name, text, needle) {
  if (!text.includes(needle)) {
    throw new Error(`${name} missing required text: ${needle}`);
  }
}

function runChecks(overrides = {}) {
  const review = overrides.review ?? read(files.review);
  const checklist = overrides.checklist ?? read(files.checklist);
  const log = overrides.log ?? read(files.log);
  const accessSurface = overrides.accessSurface ?? read(files.accessSurface);
  const entrypointMap = overrides.entrypointMap ?? read(files.entrypointMap);
  const rubitimeAudit = overrides.rubitimeAudit ?? read(files.rubitimeAudit);
  const systemSettingsChecklist =
    overrides.systemSettingsChecklist ?? read(files.systemSettingsChecklist);
  const p08CodeFacts = overrides.p08CodeFacts ?? read(files.p08CodeFacts);

  for (const needle of [
    'T0.5-T0.8 readiness review',
    'System settings mirror removal is not assumed.',
    'Reminder bot dispatch is not assumed public-only.',
    'Rubitime legacy paths are not assumed removed.',
    '`integrator.contacts` fallback is not assumed removed.',
    'Queue/retention cleanup is not treated as business-data migration.',
    'No RLS/runtime role flip was performed.',
  ]) {
    assertContains(files.review, review, needle);
  }

  for (const needle of [
    '- [x] System settings mirror removal is not assumed; runtime reads already use public canonical settings.',
    '- [x] Reminder bot dispatch is not assumed public-only; integrator dispatch state remains live.',
    '- [x] Rubitime legacy paths are not assumed removed; canonical booking cutover is a separate gate.',
    '- [x] `integrator.contacts` fallback is not assumed removed; `public_only` cutover needs a clean exception audit.',
    '- [x] Queue/retention cleanup is not treated as business-data migration.',
  ]) {
    assertContains(files.checklist, checklist, needle);
  }

  assertContains(files.log, log, 'R2 / T0.5-T0.8 readiness markers');
  assertContains(files.log, log, 'T0_5_T0_8_READINESS_REVIEW.md');

  for (const needle of [
    'Runtime reads must remain on public canonical accessor paths.',
    'Do not assume public-only scheduling.',
    'Treat as live legacy adapter until canonical read-source flips and parity are proven.',
    '`integrator.contacts` fallback remains live until exception audit and `public_only` setting cutover.',
    'Technical state. Add principal/retention handling; do not collapse into business canon.',
  ]) {
    assertContains(files.accessSurface, accessSurface, needle);
  }

  for (const needle of [
    'Rubitime multi-organization ingress is still a later cutover decision',
    '`integrator.contacts` fallback removal and `integrator_linked_phone_source=public_only` remain owner-gated follow-up work.',
    'Queue/outbox retention cleanup remains operational cleanup, not business-data migration.',
  ]) {
    assertContains(files.entrypointMap, entrypointMap, needle);
  }

  assertContains(
    files.rubitimeAudit,
    rubitimeAudit,
    '`integrator.rubitime_records` and `integrator.rubitime_events` are live legacy adapter/projection state',
  );

  for (const needle of [
    'Public and integrator mirror schemas match.',
    'Existing global settings behavior is preserved.',
    'Org-specific overrides are possible through the canonical service path.',
    'Raw `system_settings` reads remain guarded.',
  ]) {
    assertContains(files.systemSettingsChecklist, systemSettingsChecklist, needle);
  }

  for (const needle of [
    'no runtime role/env/grant flip',
    'no dev/prod/test application DB mutation',
    'global `organization_id IS NULL` rows remain visible before org context',
    'LEGACY` remains frozen and is not retrofitted in this stage',
  ]) {
    assertContains(files.p08CodeFacts, p08CodeFacts, needle);
  }
}

if (process.argv.includes('--self-test')) {
  const checklist = read(files.checklist).replace(
    '- [x] Rubitime legacy paths are not assumed removed; canonical booking cutover is a separate gate.',
    '- [ ] Rubitime legacy paths are not assumed removed; canonical booking cutover is a separate gate.',
  );
  try {
    runChecks({ checklist });
  } catch {
    console.log('check-t0-5-t0-8-readiness self-test: OK');
    process.exit(0);
  }
  throw new Error('self-test did not detect unchecked Rubitime readiness marker');
}

try {
  runChecks();
  console.log('check-t0-5-t0-8-readiness: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-t0-5-t0-8-readiness: ${message}`);
  process.exit(1);
}

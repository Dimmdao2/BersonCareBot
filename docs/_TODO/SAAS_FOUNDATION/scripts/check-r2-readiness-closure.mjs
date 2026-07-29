#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

const files = {
  closure: 'docs/archive/2026-07-plans/SAAS_FOUNDATION/R2_READINESS_CLOSURE.md',
  roadmap: 'docs/_TODO/SAAS_FOUNDATION/ROADMAP_TO_SAAS.md',
  checklist: 'docs/archive/2026-07-plans/SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md',
  t0Readiness: 'docs/_TODO/SAAS_FOUNDATION/T0_5_T0_8_READINESS_REVIEW.md',
  entrypointMap: 'docs/_TODO/SAAS_FOUNDATION/T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md',
  roleSplit: 'docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT.md',
  contextChecklist: 'docs/archive/2026-07-plans/SAAS_FOUNDATION/P0_6_DORMANT_CONTEXT_CHECKLIST.md',
  writerCensus: 'docs/_TODO/SAAS_FOUNDATION/P0_7_WRITER_CENSUS.md',
  writerCensusChecklist: 'docs/_TODO/SAAS_FOUNDATION/P0_7_WRITER_CENSUS_CHECKLIST.md',
  p08Facts: 'docs/_TODO/SAAS_FOUNDATION/P0_8_CODE_FACTS.md',
  p09Checklist: 'docs/archive/2026-07-plans/SAAS_FOUNDATION/P0_9_DEFAULT_DENY_CHECKLIST.md',
  p13Checklist: 'docs/archive/2026-07-plans/SAAS_FOUNDATION/P0_13_ISOLATION_FIXTURES_CHECKLIST.md',
  regression: 'scripts/check-saas-db-regression.mjs',
  log: 'docs/_TODO/SAAS_FOUNDATION/LOG.md',
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
  const closure = overrides.closure ?? read(files.closure);
  const roadmap = overrides.roadmap ?? read(files.roadmap);
  const checklist = overrides.checklist ?? read(files.checklist);
  const t0Readiness = overrides.t0Readiness ?? read(files.t0Readiness);
  const entrypointMap = overrides.entrypointMap ?? read(files.entrypointMap);
  const roleSplit = overrides.roleSplit ?? read(files.roleSplit);
  const contextChecklist = overrides.contextChecklist ?? read(files.contextChecklist);
  const writerCensus = overrides.writerCensus ?? read(files.writerCensus);
  const writerCensusChecklist =
    overrides.writerCensusChecklist ?? read(files.writerCensusChecklist);
  const p08Facts = overrides.p08Facts ?? read(files.p08Facts);
  const p09Checklist = overrides.p09Checklist ?? read(files.p09Checklist);
  const p13Checklist = overrides.p13Checklist ?? read(files.p13Checklist);
  const regression = overrides.regression ?? read(files.regression);
  const log = overrides.log ?? read(files.log);

  for (const needle of [
    'R2 readiness closure',
    'Taskdb: `#641`',
    'Request and process tenant principal set through the chokepoint.',
    'Non-bypass app DB role validated in prod-parity environment.',
    'Staging shadow-run for wrong-org/empty-org/unenforced cases.',
    'RLS enforcement flip plan and rollback.',
    'Doctor/admin gates use membership, not implicit single-clinic assumptions.',
    'T0.5-T0.8 are closed as R2 readiness constraints, not as enforcement execution.',
    'No runtime role/env/grant change.',
    'pnpm run ci',
  ]) {
    assertContains(files.closure, closure, needle);
  }

  for (const needle of [
    '### R2 — Tenant-context cutover',
    'request and process tenant principal set through the chokepoint',
    'non-bypass app DB role validated in prod-parity environment',
    'staging shadow-run for wrong-org/empty-org/unenforced cases',
    'RLS enforcement flip plan and rollback',
    'doctor/admin gates use membership',
    'synthetic two-org tests prove org wall and patient wall under non-bypass role',
  ]) {
    assertContains(files.roadmap, roadmap, needle);
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

  for (const needle of [
    'This review does not execute T0.5-T0.8 runtime changes',
    'Do not remove `integrator.system_settings` mirror paths',
    'integrator reminder dispatch state remains live',
    'Legacy Rubitime/appointment projections remain live compatibility state.',
  ]) {
    assertContains(files.t0Readiness, t0Readiness, needle);
  }

  for (const needle of [
    'Scheduler tick',
    'Runtime worker: outgoing delivery queue',
    'Rubitime multi-organization ingress is still a later cutover decision',
    '`integrator.contacts` fallback removal and `integrator_linked_phone_source=public_only` remain owner-gated follow-up work.',
  ]) {
    assertContains(files.entrypointMap, entrypointMap, needle);
  }

  for (const needle of [
    'App runtime role',
    'Must be `NOBYPASSRLS`',
    'Runtime role switching is not performed in P0.5/B5',
    'No dev/prod DB write.',
  ]) {
    assertContains(files.roleSplit, roleSplit, needle);
  }

  for (const needle of [
    'One central dormant principal carrier exists.',
    'Unset context preserves current single-clinic behavior.',
    'No request/org state is captured in singleton DI caches.',
    'No RLS/enforcement/runtime role flip happened.',
  ]) {
    assertContains(files.contextChecklist, contextChecklist, needle);
  }

  for (const needle of [
    'Covered webapp routes/app-layer, integrator API/bot, worker/scheduler, media-worker, payment/webhook, and boot/migration paths.',
    '`platform-merge` and `booking-rubitime-sync` are caller-transport packages.',
    '`integrator.mailings` is classified SCOPED/direct-org',
  ]) {
    assertContains(files.writerCensus, writerCensus, needle);
  }

  for (const needle of [
    'P0.7.1 census covers every known SCOPED writer family.',
    'Unset context preserves current runtime behavior.',
    'No writer bypasses the DB chokepoint after the family stage.',
  ]) {
    assertContains(files.writerCensusChecklist, writerCensusChecklist, needle);
  }

  for (const needle of [
    'P0.8.3 no longer lacks generator/scratch-smoke tooling',
    'P0.8.4 has generator/scratch-smoke tooling',
    'P0.8.5 has generator/scratch-smoke tooling',
    'P0.8.6 has generator/scratch-smoke tooling',
    'P0.8.7 has a deterministic DB-free guard',
    'no runtime role/env/grant flip',
  ]) {
    assertContains(files.p08Facts, p08Facts, needle);
  }

  for (const needle of [
    'Enforce-mode default-deny differs from P0.8 dormant SCOPED policies',
    'P0.9.1 does not replace those production policies.',
  ]) {
    assertContains(files.p09Checklist, p09Checklist, needle);
  }

  for (const needle of [
    'Create synthetic second organization fixture.',
    'Run under non-bypass app role in scratch/non-prod.',
    'App-Level Dormant Smoke',
    'App-level dormant mode preserves existing single-clinic behavior.',
  ]) {
    assertContains(files.p13Checklist, p13Checklist, needle);
  }

  for (const needle of [
    'SAAS P0.5 role split contract/proof artifacts',
    'SAAS P0.8.5 integrator SCOPED policy generator',
    'SAAS P0.13.2 DB isolation assertions',
    'SAAS P0.13.3 app-level dormant smoke',
  ]) {
    assertContains(files.regression, regression, needle);
  }

  assertContains(files.log, log, 'R2 / T0.5-T0.8 readiness markers');
}

if (process.argv.includes('--self-test')) {
  const closure = read(files.closure).replace(
    'No runtime role/env/grant change.',
    'Runtime role/env/grant change allowed.',
  );
  try {
    runChecks({ closure });
  } catch {
    console.log('check-r2-readiness-closure self-test: OK');
    process.exit(0);
  }
  throw new Error('self-test did not detect weakened runtime role boundary');
}

try {
  runChecks();
  console.log('check-r2-readiness-closure: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-r2-readiness-closure: ${message}`);
  process.exit(1);
}

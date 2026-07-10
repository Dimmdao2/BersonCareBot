#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

const files = {
  audit: "docs/_TODO/SAAS_FOUNDATION/T0_4_RUBITIME_APPOINTMENT_ORG_AUDIT.md",
  integratorSchema: "apps/integrator/src/infra/db/schema/integratorDomainRepos.ts",
  webappSchema: "apps/webapp/db/schema/schema.ts",
  writePort: "apps/integrator/src/infra/db/writePort.ts",
  mirrorSyncService: "apps/webapp/src/modules/booking-appointment-sync/service.ts",
  bridgeRepo: "apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts",
  events: "apps/webapp/src/modules/integrator/events.ts",
};

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function assertContains(name, text, needle) {
  if (!text.includes(needle)) {
    throw new Error(`${name} missing required text: ${needle}`);
  }
}

function assertNotContains(name, text, needle) {
  if (text.includes(needle)) {
    throw new Error(`${name} unexpectedly contains text: ${needle}`);
  }
}

function extractConstBlock(text, constName) {
  const startNeedle = `export const ${constName}`;
  const start = text.indexOf(startNeedle);
  if (start < 0) {
    throw new Error(`missing ${startNeedle}`);
  }
  const next = text.indexOf("\nexport const ", start + startNeedle.length);
  return text.slice(start, next < 0 ? text.length : next);
}

function runChecks(overrides = {}) {
  const audit = overrides.audit ?? read(files.audit);
  const integratorSchema = overrides.integratorSchema ?? read(files.integratorSchema);
  const webappSchema = overrides.webappSchema ?? read(files.webappSchema);
  const writePort = overrides.writePort ?? read(files.writePort);
  const mirrorSyncService = overrides.mirrorSyncService ?? read(files.mirrorSyncService);
  const bridgeRepo = overrides.bridgeRepo ?? read(files.bridgeRepo);
  const events = overrides.events ?? read(files.events);

  for (const needle of [
    "Rubitime/appointment T0.4 is not a simple `organization_id` writer-stamp slice.",
    "`integrator.rubitime_records` and `integrator.rubitime_events` are live legacy adapter/projection state",
    "`public.appointment_records` is a deprecated but live legacy projection",
    "The remaining work belongs to the T0.4 entrypoint-to-org map",
  ]) {
    assertContains(files.audit, audit, needle);
  }

  assertNotContains(
    `${files.integratorSchema}:rubitimeRecords`,
    extractConstBlock(integratorSchema, "rubitimeRecords"),
    "organizationId",
  );
  assertNotContains(
    `${files.integratorSchema}:rubitimeEvents`,
    extractConstBlock(integratorSchema, "rubitimeEvents"),
    "organizationId",
  );
  assertNotContains(
    `${files.webappSchema}:appointmentRecords`,
    extractConstBlock(webappSchema, "appointmentRecords"),
    "organizationId",
  );

  for (const needle of [
    "case 'booking.upsert'",
    "upsertAppointmentRecordFromBookingMutation(txDb",
    "buildAppointmentRecordUpsertedFanout",
  ]) {
    assertContains(files.writePort, writePort, needle);
  }

  for (const needle of [
    "organizationId: input.organizationId",
    "deps.bridge.upsertCanonicalFromRubitimeRecord",
  ]) {
    assertContains(files.mirrorSyncService, mirrorSyncService, needle);
  }

  for (const needle of [
    "async function projectRows(\n  organizationId: string",
    "organizationId: params.organizationId",
    "projectAppointmentRecords(organizationId)",
    "projectRubitimeRecords(organizationId)",
  ]) {
    assertContains(files.bridgeRepo, bridgeRepo, needle);
  }

  for (const needle of [
    "const organizationId = await deps.rubitimeCanonicalProjection.getDefaultOrganizationId()",
    "upsertCanonicalFromRubitimeRecord({",
    "organizationId,",
  ]) {
    assertContains(files.events, events, needle);
  }
}

if (process.argv.includes("--self-test")) {
  const bridgeRepo = read(files.bridgeRepo).replaceAll(
    "organizationId: params.organizationId",
    "organizationId: null",
  );
  try {
    runChecks({ bridgeRepo });
  } catch {
    console.log("check-t0-4-rubitime-appointment-org-audit self-test: OK");
    process.exit(0);
  }
  throw new Error("self-test did not detect missing canonical bridge organization stamp");
}

try {
  runChecks();
  console.log("check-t0-4-rubitime-appointment-org-audit: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-t0-4-rubitime-appointment-org-audit: ${message}`);
  process.exit(1);
}

#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();

const files = {
  map: "docs/_TODO/SAAS_FOUNDATION/T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md",
  checklist: "docs/_TODO/SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md",
  routes: "apps/integrator/src/app/routes.ts",
  telegramWebhook: "apps/integrator/src/integrations/telegram/webhook.ts",
  telegramLongPolling: "apps/integrator/src/integrations/telegram/longPolling.ts",
  telegramTest: "apps/integrator/src/integrations/telegram/processTelegramUpdate.test.ts",
  maxWebhook: "apps/integrator/src/integrations/max/webhook.ts",
  maxTest: "apps/integrator/src/integrations/max/webhook.test.ts",
  requestContactRoute: "apps/integrator/src/integrations/bersoncare/requestContactRoute.ts",
  requestContactTest: "apps/integrator/src/integrations/bersoncare/requestContactRoute.test.ts",
  reminderRulesRoute: "apps/integrator/src/integrations/bersoncare/reminderRulesRoute.ts",
  reminderRulesTest: "apps/integrator/src/integrations/bersoncare/reminderRulesRoute.test.ts",
  rubitimeAudit: "docs/_TODO/SAAS_FOUNDATION/T0_4_RUBITIME_APPOINTMENT_ORG_AUDIT.md",
  schedulerMain: "apps/integrator/src/infra/runtime/scheduler/main.ts",
  reminderHandler: "apps/integrator/src/kernel/domain/executor/handlers/reminders.ts",
  reminderTenantTest: "apps/integrator/src/kernel/domain/executor/handlers/reminders.tenantContext.test.ts",
  outgoingWorker: "apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts",
  outgoingWorkerTest: "apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.test.ts",
  projectionWorker: "apps/integrator/src/infra/runtime/worker/projectionWorker.ts",
  jobExecutor: "apps/integrator/src/infra/runtime/worker/jobExecutor.ts",
  publicProductSchema: "apps/integrator/src/infra/db/schema/integratorPublicProduct.ts",
};

const sourceRoots = ["apps/integrator/src"];
const mailingsWriterPatterns = [
  /insert\s*\(\s*mailings\s*\)/,
  /\.insert\s*\(\s*mailings\s*\)/,
  /update\s*\(\s*mailings\s*\)/,
  /\.update\s*\(\s*mailings\s*\)/,
  /from\s*\(\s*mailings\s*\)/,
  /mailings\s*\)\s*\.values/,
];

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

function listFiles(dir) {
  const absoluteDir = join(repoRoot, dir);
  const entries = readdirSync(absoluteDir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const absolutePath = join(absoluteDir, entry.name);
    const relativePath = relative(repoRoot, absolutePath);
    if (entry.isDirectory()) {
      result.push(...listFiles(relativePath));
    } else if (entry.isFile() && /\.(ts|tsx|js|mjs|sql)$/.test(entry.name)) {
      result.push(relativePath);
    }
  }
  return result;
}

function assertNoRuntimeMailingsWriter(overrides = {}) {
  const filesToScan = sourceRoots.flatMap((root) => listFiles(root));
  for (const file of filesToScan) {
    if (file.includes("/migrations/")) continue;
    const text = overrides[file] ?? read(file);
    for (const pattern of mailingsWriterPatterns) {
      if (pattern.test(text)) {
        throw new Error(`${file} contains a live integrator.mailings writer pattern: ${pattern}`);
      }
    }
  }
}

function runChecks(overrides = {}) {
  const map = overrides.map ?? read(files.map);
  const checklist = overrides.checklist ?? read(files.checklist);
  const routes = overrides.routes ?? read(files.routes);
  const telegramWebhook = overrides.telegramWebhook ?? read(files.telegramWebhook);
  const telegramLongPolling = overrides.telegramLongPolling ?? read(files.telegramLongPolling);
  const telegramTest = overrides.telegramTest ?? read(files.telegramTest);
  const maxWebhook = overrides.maxWebhook ?? read(files.maxWebhook);
  const maxTest = overrides.maxTest ?? read(files.maxTest);
  const requestContactRoute = overrides.requestContactRoute ?? read(files.requestContactRoute);
  const requestContactTest = overrides.requestContactTest ?? read(files.requestContactTest);
  const reminderRulesRoute = overrides.reminderRulesRoute ?? read(files.reminderRulesRoute);
  const reminderRulesTest = overrides.reminderRulesTest ?? read(files.reminderRulesTest);
  const rubitimeAudit = overrides.rubitimeAudit ?? read(files.rubitimeAudit);
  const schedulerMain = overrides.schedulerMain ?? read(files.schedulerMain);
  const reminderHandler = overrides.reminderHandler ?? read(files.reminderHandler);
  const reminderTenantTest = overrides.reminderTenantTest ?? read(files.reminderTenantTest);
  const outgoingWorker = overrides.outgoingWorker ?? read(files.outgoingWorker);
  const outgoingWorkerTest = overrides.outgoingWorkerTest ?? read(files.outgoingWorkerTest);
  const projectionWorker = overrides.projectionWorker ?? read(files.projectionWorker);
  const jobExecutor = overrides.jobExecutor ?? read(files.jobExecutor);
  const publicProductSchema = overrides.publicProductSchema ?? read(files.publicProductSchema);

  for (const needle of [
    "T0.4 integrator entrypoint organization-context map",
    "Telegram webhook",
    "Telegram long polling",
    "MAX webhook",
    "BersonCare request-contact M2M",
    "BersonCare reminder-rules M2M",
    "Rubitime webhook / Rubitime M2M",
    "Scheduler tick",
    "Runtime worker: outgoing delivery queue",
    "Runtime worker: projection outbox",
    "Runtime worker: generic retry jobs",
    "`integrator.mailings`",
    "no live runtime insert/update writer",
  ]) {
    assertContains(files.map, map, needle);
  }

  for (const needle of [
    "- [x] Integrator DB trunk: every SCOPED integrator writer derives or receives organization context.",
    "- [x] Integrator entrypoint-to-org map: Telegram/MAX/Rubitime/M2M/worker/scheduler sources documented and tested.",
    "- [x] Integrator worker/scheduler: jobs that touch SCOPED rows run with the correct organization principal.",
    "- [x] Focused tests and source audit cover runtime paths.",
  ]) {
    assertContains(files.checklist, checklist, needle);
  }

  for (const needle of [
    "createResolveOrganizationIdForMessengerIdentity",
    "createResolveOrganizationIdForIntegratorUserId",
    "resolveActiveOrganizationIdForMessengerIdentity(db, { resource, externalId })",
    "resolveActiveOrganizationIdForIntegratorUserId(db, integratorUserId)",
    "resolveOrganizationIdForMessengerIdentity,",
    "resolveOrganizationIdForIntegratorUserId,",
  ]) {
    assertContains(files.routes, routes, needle);
  }

  for (const needle of [
    "resolveTelegramOrganizationId",
    "await deps.resolveOrganizationIdForMessengerIdentity(externalId, 'telegram')",
    "resolveTelegramIntegratorUserId",
    "runWithIntegratorPrincipal",
    "runWithOrganizationPrincipal(organizationId, handleEvent)",
    "export async function processTelegramUpdate",
  ]) {
    assertContains(files.telegramWebhook, telegramWebhook, needle);
  }
  assertContains(files.telegramLongPolling, telegramLongPolling, "await processTelegramUpdate(parsed.data, deps");
  assertContains(files.telegramTest, telegramTest, "toHaveBeenCalledWith('100', 'telegram')");

  for (const needle of [
    "resolveMaxOrganizationId",
    "await deps.resolveOrganizationIdForMessengerIdentity(externalId, 'max')",
    "resolveMaxIntegratorUserId",
    "runWithIntegratorPrincipal",
    "runWithOrganizationPrincipal(organizationId, handleEvent)",
  ]) {
    assertContains(files.maxWebhook, maxWebhook, needle);
  }
  assertContains(files.maxTest, maxTest, "toHaveBeenCalledWith('100', 'max')");

  for (const needle of [
    "resolveOrganizationIdForMessengerIdentity",
    "organizationId = await resolveOrganizationIdForMessengerIdentity(recipientId, channel)",
    "await runWithOrganizationPrincipal(organizationId, dispatchContact)",
  ]) {
    assertContains(files.requestContactRoute, requestContactRoute, needle);
  }
  assertContains(
    files.requestContactTest,
    requestContactTest,
    "runs request-contact dispatch under resolved recipient organization context",
  );

  for (const needle of [
    "resolveOrganizationIdForIntegratorUserId",
    "organizationId = await resolveOrganizationIdForIntegratorUserId(payload.integratorUserId)",
    "await runWithOrganizationPrincipal(organizationId, writeRule)",
  ]) {
    assertContains(files.reminderRulesRoute, reminderRulesRoute, needle);
  }
  assertContains(files.reminderRulesTest, reminderRulesTest, "toHaveBeenCalledWith('42')");

  for (const needle of [
    "`integrator.rubitime_records` and `integrator.rubitime_events` are live legacy adapter/projection state",
    "The remaining work belongs to the T0.4 entrypoint-to-org map",
  ]) {
    assertContains(files.rubitimeAudit, rubitimeAudit, needle);
  }

  assertContains(files.schedulerMain, schedulerMain, "source: 'scheduler'");
  for (const needle of [
    "async function persistWritesByOrganization",
    "runWithOptionalOrganizationPrincipal",
    "recordMessengerChannelSkipsBestEffort",
    "recordMessengerNotEnqueuedSkipsBestEffort",
  ]) {
    assertContains(files.reminderHandler, reminderHandler, needle);
  }
  for (const needle of [
    "reminders tenant context for scheduler writers",
    "runs planDue occurrence writes under the rule organization when present",
    "runs dispatchDue queued writes and skip attempts under the occurrence organization",
  ]) {
    assertContains(files.reminderTenantTest, reminderTenantTest, needle);
  }

  for (const needle of [
    "async function runWithReminderOccurrenceOrganization",
    "async function runWithBroadcastAuditOrganization",
    "runWithOrganizationPrincipal(organizationId",
    "recordMessengerQueueDeliveryAttempt",
    "organizationId,",
  ]) {
    assertContains(files.outgoingWorker, outgoingWorker, needle);
  }
  for (const needle of [
    "runs reminder scoped writes under occurrence organization and queue status without context",
    "runs broadcast audit and notification attempts under audit organization and queue status without context",
  ]) {
    assertContains(files.outgoingWorkerTest, outgoingWorkerTest, needle);
  }

  assertContains(files.projectionWorker, projectionWorker, "runProjectionWorkerTick");
  assertContains(files.jobExecutor, jobExecutor, "executeJob");
  assertNotContains(files.projectionWorker, projectionWorker, "runWithOrganizationPrincipal");
  assertNotContains(files.jobExecutor, jobExecutor, "runWithOrganizationPrincipal");

  assertNotContains(files.publicProductSchema, publicProductSchema, "export const mailings");
  assertContains(files.publicProductSchema, publicProductSchema, "export const mailingLogs");
  assertNoRuntimeMailingsWriter(overrides);
}

if (process.argv.includes("--self-test")) {
  const telegramWebhook = read(files.telegramWebhook).replace(
    "runWithOrganizationPrincipal(organizationId, handleEvent)",
    "handleEvent()",
  );
  try {
    runChecks({ telegramWebhook });
  } catch {
    console.log("check-t0-4-entrypoint-org-map self-test: OK");
    process.exit(0);
  }
  throw new Error("self-test did not detect missing Telegram organization principal wrapper");
}

try {
  if (!statSync(join(repoRoot, files.map)).isFile()) {
    throw new Error(`${files.map} is not a file`);
  }
  runChecks();
  console.log("check-t0-4-entrypoint-org-map: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-t0-4-entrypoint-org-map: ${message}`);
  process.exit(1);
}

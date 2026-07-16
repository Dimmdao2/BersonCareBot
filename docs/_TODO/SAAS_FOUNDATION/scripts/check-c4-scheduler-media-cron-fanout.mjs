#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const repoRoot = process.cwd();

const files = {
  doc: "docs/_TODO/SAAS_FOUNDATION/SAAS_C4_SCHEDULER_MEDIA_CRON_FANOUT.md",
  roadmap: "docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md",
  t0Checklist: "docs/_TODO/SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md",
  scheduler: "apps/integrator/src/infra/runtime/scheduler/main.ts",
  integratorPoolProvider: "apps/integrator/src/infra/db/integratorPoolProvider.ts",
  integratorWithClient: "apps/integrator/src/infra/db/withClient.ts",
  integratorWithClientTest: "apps/integrator/src/infra/db/withClient.test.ts",
  operationalReadiness: "apps/integrator/src/infra/db/operationalPoolReadiness.ts",
  integratorDi: "apps/integrator/src/app/di.ts",
  workerMain: "apps/integrator/src/infra/runtime/worker/main.ts",
  outgoingDeliveryScope: "apps/integrator/src/infra/db/repos/outgoingDeliveryScope.ts",
  operatorDeliveryAttempts: "apps/integrator/src/infra/db/repos/operatorDeliveryAttempts.ts",
  operatorAttemptWritePort: "apps/integrator/src/infra/runtime/worker/operatorDeliveryAttemptWritePort.ts",
  operatorAttemptWritePortTest: "apps/integrator/src/infra/runtime/worker/operatorDeliveryAttemptWritePort.test.ts",
  dispatchPort: "apps/integrator/src/infra/adapters/dispatchPort.ts",
  dispatchPortTest: "apps/integrator/src/infra/adapters/dispatchPort.test.ts",
  reportOperatorFailure: "apps/integrator/src/infra/operatorIncident/reportOperatorFailure.ts",
  reportOperatorFailureTest: "apps/integrator/src/infra/operatorIncident/reportOperatorFailure.test.ts",
  outgoingDeliveryWorker: "apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts",
  schedulerOrganizationRepo: "apps/integrator/src/infra/db/repos/schedulerReminderOrganizations.ts",
  schedulerOrganizationTicks: "apps/integrator/src/infra/runtime/scheduler/organizationTicks.ts",
  mediaMain: "apps/media-worker/src/main.ts",
  mediaWorkerTick: "apps/media-worker/src/workerTick.ts",
  mediaClaim: "apps/media-worker/src/jobs/claim.ts",
  mediaWithClient: "apps/media-worker/src/withClient.ts",
  mediaPoolProvider: "apps/media-worker/src/poolProvider.ts",
  mediaProcess: "apps/media-worker/src/processTranscodeJob.ts",
  mediaSql: "apps/media-worker/src/runMediaWorkerSql.ts",
  mediaPrincipalTest: "apps/media-worker/src/processTranscodeJob.principal.test.ts",
  mediaWithClientTest: "apps/media-worker/src/withClient.test.ts",
  mediaRuntimeConfig: "apps/media-worker/src/serverRuntimeConfig.ts",
  operationalSql: "deploy/postgres/c4-operational-runtime.sql",
  operationalReadinessScript: "deploy/host/assert-c4-operational-runtime-ready.sh",
  operationalProvisionScript: "deploy/host/provision-c4-operational-runtime.sh",
  testDeploy: "deploy/host/deploy-test-saas.sh",
  cronRegistry: "apps/webapp/src/modules/operator-health/cronJobRegistry.ts",
  mediaPresign: "apps/webapp/src/app/api/media/presign/route.ts",
  mediaMultipartInit: "apps/webapp/src/app/api/media/multipart/init/route.ts",
  mediaMultipartPartUrl: "apps/webapp/src/app/api/media/multipart/part-url/route.ts",
  mediaPlayback: "apps/webapp/src/app/api/media/[id]/playback/route.ts",
  integratorOperatorHealthProbe: "apps/integrator/src/integrations/bersoncare/operatorHealthProbeRoute.ts",
  packageJson: "package.json",
};

const webappInternalRoutesDir = "apps/webapp/src/app/api/internal";

const expectedInternalRoutes = [
  {
    id: "hls_proxy_retention",
    path: "/api/internal/media-hls-proxy-errors/retention",
    source: "apps/webapp/src/app/api/internal/media-hls-proxy-errors/retention/route.ts",
  },
  {
    id: "media_multipart",
    path: "/api/internal/media-multipart/cleanup",
    source: "apps/webapp/src/app/api/internal/media-multipart/cleanup/route.ts",
  },
  {
    id: "media_purge",
    path: "/api/internal/media-pending-delete/purge",
    source: "apps/webapp/src/app/api/internal/media-pending-delete/purge/route.ts",
  },
  {
    id: "playback_retention",
    path: "/api/internal/media-playback-stats/retention",
    source: "apps/webapp/src/app/api/internal/media-playback-stats/retention/route.ts",
  },
  {
    id: "media_preview",
    path: "/api/internal/media-preview/process",
    source: "apps/webapp/src/app/api/internal/media-preview/process/route.ts",
  },
  {
    id: "media_transcode_enqueue",
    path: "/api/internal/media-transcode/enqueue",
    source: "apps/webapp/src/app/api/internal/media-transcode/enqueue/route.ts",
  },
  {
    id: "media_transcode_reconcile",
    path: "/api/internal/media-transcode/reconcile",
    source: "apps/webapp/src/app/api/internal/media-transcode/reconcile/route.ts",
  },
  {
    id: "operator_health_critical",
    path: "/api/internal/operator-health-critical/tick",
    source: "apps/webapp/src/app/api/internal/operator-health-critical/tick/route.ts",
  },
  {
    id: "operator_health_digest",
    path: "/api/internal/operator-health-digest/tick",
    source: "apps/webapp/src/app/api/internal/operator-health-digest/tick/route.ts",
  },
  {
    id: "product_analytics_retention",
    path: "/api/internal/product-analytics/retention",
    source: "apps/webapp/src/app/api/internal/product-analytics/retention/route.ts",
  },
  {
    id: "webpush_reminders",
    path: "/api/internal/reminders/web-push-only/tick",
    source: "apps/webapp/src/app/api/internal/reminders/web-push-only/tick/route.ts",
  },
  {
    id: "specialist_task_reminders_tick",
    path: "/api/internal/specialist-task-reminders/tick",
    source: "apps/webapp/src/app/api/internal/specialist-task-reminders/tick/route.ts",
  },
  {
    id: "system_health_guard",
    path: "/api/internal/system-health-guard/tick",
    source: "apps/webapp/src/app/api/internal/system-health-guard/tick/route.ts",
  },
];

const internalRoutesNotInCronRegistry = new Set(["/api/internal/media-transcode/enqueue"]);

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      fail(`${label} missing required fragment: ${fragment}`);
    }
  }
}

function forbidFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (text.includes(fragment)) {
      fail(`${label} contains forbidden stale fragment: ${fragment}`);
    }
  }
}

function requireFragmentBefore(label, text, before, after) {
  const beforeIndex = text.indexOf(before);
  const afterIndex = text.indexOf(after);
  if (beforeIndex < 0) fail(`${label} missing required fragment: ${before}`);
  if (afterIndex < 0) fail(`${label} missing required fragment: ${after}`);
  if (beforeIndex > afterIndex) {
    fail(`${label} must contain ${before} before ${after}`);
  }
}

function requireOccurrenceCountAtLeast(label, text, fragment, minCount) {
  const count = text.split(fragment).length - 1;
  if (count < minCount) fail(`${label} must contain ${fragment} at least ${minCount} times, found ${count}`);
}

function listRouteFiles(rootRelativePath) {
  const root = join(repoRoot, rootRelativePath);
  const out = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const st = statSync(path);
      if (st.isDirectory()) {
        walk(path);
        continue;
      }
      if (entry === "route.ts") {
        out.push(relative(repoRoot, path).split(sep).join("/"));
      }
    }
  }
  walk(root);
  return out.sort();
}

function routePathFromInternalRouteFile(path) {
  const prefix = `${webappInternalRoutesDir}/`;
  const suffix = "/route.ts";
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) {
    fail(`Unexpected internal route file path: ${path}`);
  }
  return `/api/internal/${path.slice(prefix.length, -suffix.length)}`;
}

function extractCronRegistryInternalPaths(text) {
  const paths = new Set();
  const re = /internalPath:\s*"([^"]+)"/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    paths.add(match[1]);
  }
  return [...paths].sort();
}

function assertWebappInternalRoutesCovered(loaded) {
  const actualFiles = listRouteFiles(webappInternalRoutesDir);
  const expectedFiles = expectedInternalRoutes.map((entry) => entry.source).sort();
  const missing = expectedFiles.filter((path) => !actualFiles.includes(path));
  const unexpected = actualFiles.filter((path) => !expectedFiles.includes(path));
  if (missing.length > 0) {
    fail(`C4 checker references missing webapp internal route files: ${missing.join(", ")}`);
  }
  if (unexpected.length > 0) {
    fail(`C4 inventory/checker missing new webapp internal route files: ${unexpected.join(", ")}`);
  }

  for (const entry of expectedInternalRoutes) {
    const routeText = loaded[entry.source] ?? read(entry.source);
    const expectedPath = routePathFromInternalRouteFile(entry.source);
    if (entry.path !== expectedPath) {
      fail(`C4 expected path mismatch for ${entry.source}: ${entry.path} !== ${expectedPath}`);
    }
    requireFragments(entry.source, routeText, [
      "INTERNAL_JOB_SECRET",
      "bearerMatchesSecret",
      "enterWithDbInfraPrincipal",
      `source: "${entry.path.slice(1)}:POST"`,
    ]);
    requireFragmentBefore(
      entry.source,
      routeText,
      "bearerMatchesSecret(token, secret)",
      `source: "${entry.path.slice(1)}:POST"`,
    );
    requireFragments(files.doc, loaded.doc, [`| \`${entry.id}\` |`, `\`${entry.path}\``, `\`${entry.source}\``]);
  }

  const registryPaths = extractCronRegistryInternalPaths(loaded.cronRegistry);
  for (const entry of expectedInternalRoutes) {
    if (internalRoutesNotInCronRegistry.has(entry.path)) {
      continue;
    }
    if (!registryPaths.includes(entry.path)) {
      fail(`${files.cronRegistry} missing internalPath for ${entry.path}`);
    }
  }
  if (!registryPaths.includes("/internal/operator-health-probe")) {
    fail(`${files.cronRegistry} missing /internal/operator-health-probe`);
  }
  requireFragments(files.doc, loaded.doc, [
    "`outbound_integration_probes`",
    "`/internal/operator-health-probe`",
    "`apps/integrator/src/integrations/bersoncare/operatorHealthProbeRoute.ts`",
  ]);
}

function assertScheduler(loaded) {
  requireFragments(files.scheduler, loaded.scheduler, [
    "runWithInfraPrincipal({ source: 'scheduler:acquire-lock' }",
    "tryAcquireSchedulerLock(SCHEDULER_LOCK_KEY)",
    "runSchedulerOrganizationTicks",
  ]);
  requireFragmentBefore(files.scheduler, loaded.scheduler, "runWithInfraPrincipal({ source: 'scheduler:acquire-lock' }", "const { buildDeps }");
  requireFragments(files.doc, loaded.doc, [
    "`scheduler-lock`",
    "`scheduler-tick`",
    "`scheduler:acquire-lock`",
    "`scheduler:handle-tick-event`",
  ]);
  requireFragments(files.integratorPoolProvider, loaded.integratorPoolProvider, [
    "DATABASE_URL_DIAGNOSTIC",
    "diagnosticConnectionString",
    "deliveryWorkerConnectionString",
    "schedulerConnectionString",
    "getCurrentIntegratorTechnicalRuntimeRole",
    "prepareIntegratorTechnicalPoolClient",
  ]);
  requireFragments(files.integratorWithClient, loaded.integratorWithClient, [
    "app_operational_diagnostic",
    "app_operational_delivery_worker",
    "app_operational_scheduler",
    "SET ROLE ${role}",
  ]);
  requireFragments(files.integratorWithClientTest, loaded.integratorWithClientTest, [
    "restores the outer capability after tenant work",
    "app_operational_delivery_worker",
  ]);
  requireFragments(files.operationalReadiness, loaded.operationalReadiness, [
    "assertIntegratorDiagnosticPoolReady",
    "assertDeliveryWorkerPoolReady",
    "assertSchedulerPoolReady",
    "BEGIN READ ONLY",
    "ROLLBACK",
  ]);
  requireFragments(files.schedulerOrganizationRepo, loaded.schedulerOrganizationRepo, [
    "app.list_scheduler_reminder_organization_ids()",
    "returned an invalid organization id",
  ]);
  requireFragments(files.schedulerOrganizationTicks, loaded.schedulerOrganizationTicks, [
    "scheduler:claim-due-jobs",
    "scheduler:handle-tick-event",
    "runWithOrganizationPrincipal(organizationId, run)",
    "sch:${organizationId}:${deps.newEventId()}",
  ]);
}

function assertMediaWorker(loaded) {
  requireFragments(files.mediaMain, loaded.mediaMain, [
    "createMediaWorkerPoolProvider",
    "runMediaWorkerTick(ctx)",
  ]);
  requireFragments(files.mediaWorkerTick, loaded.mediaWorkerTick, [
    "runWithMediaWorkerInfraPrincipal(\"media-worker:tick\"",
    "readPipelineEnabled",
    "reclaimStaleProcessing",
    "claimNextJob",
    "processTranscodeJob",
  ]);
  requireFragments(files.mediaClaim, loaded.mediaClaim, [
    "j.organization_id AS job_organization_id",
    "mf.organization_id AS media_organization_id",
    "FOR UPDATE OF j SKIP LOCKED",
    "row.job_organization_id !== row.media_organization_id",
    "organization_invariant_violation",
    "organizationId: job.organization_id",
  ]);
  requireFragments(files.mediaWithClient, loaded.mediaWithClient, [
    "allowedLockedInfraSources",
    "\"media-worker:tick\"",
    "export function assertMediaWorkerLockedPrincipalClassified",
    "DB principal context is required before media-worker scoped DB access in locked mode",
    "DB infra principal source is not allowed on media-worker pool in locked mode",
    "DB bootstrap principal source is not allowed on media-worker pool in locked mode",
    "DB organization principal is not allowed on media-worker pool in locked mode",
    "DB patient principal is not allowed on media-worker pool in locked mode",
    "DB staff principal is not allowed on media-worker pool in locked mode",
    "DB integrator principal is not allowed on media-worker pool in locked mode",
    "assertMediaWorkerLockedPrincipalClassified(principalApplyOptions);",
    "SET ROLE app_operational_media_worker",
    "const client = await pool.connect();",
  ]);
  requireFragmentBefore(
    files.mediaWithClient,
    loaded.mediaWithClient,
    "assertMediaWorkerLockedPrincipalClassified(principalApplyOptions);",
    "const client = await pool.connect();",
  );
  requireFragments(files.mediaPoolProvider, loaded.mediaPoolProvider, [
    "assertMediaWorkerLockedPrincipalClassified",
    "assertMediaWorkerLockedPrincipalClassified(principalApplyOptions);",
    "const client = await pool.connect();",
  ]);
  requireFragmentBefore(
    files.mediaPoolProvider,
    loaded.mediaPoolProvider,
    "assertMediaWorkerLockedPrincipalClassified(principalApplyOptions);",
    "const client = await pool.connect();",
  );
  requireFragments(files.mediaProcess, loaded.mediaProcess, [
    "runWithMediaWorkerInfraPrincipal(\"media-worker:process-transcode-job\"",
    "processTranscodeJobInner(ctx, job)",
  ]);
  requireFragmentBefore(
    files.mediaProcess,
    loaded.mediaProcess,
    "runWithMediaWorkerInfraPrincipal(\"media-worker:process-transcode-job\"",
    "processTranscodeJobInner(ctx, job)",
  );
  requireFragments(files.mediaPrincipalTest, loaded.mediaPrincipalTest, [
    "runs DB access under the tick infra principal",
    "media-worker:tick",
    "principal?.kind === \"infra\"",
  ]);
  requireFragments(files.mediaWithClientTest, loaded.mediaWithClientTest, [
    "fails closed in locked mode before checkout when no DB principal is active",
    "rejects missing locked DB principal before pool.query checkout",
    "rejectedLockedDbPrincipals",
    "name: \"organization\"",
    "name: \"patient\"",
    "name: \"staff\"",
    "name: \"integrator\"",
    "rejects ${testCase.name} locked DB principal before transaction checkout",
    "rejects ${testCase.name} locked DB principal before pool.query checkout",
    "expect(pool.connect).not.toHaveBeenCalled();",
    "expect(connect).not.toHaveBeenCalled();",
  ]);
  requireFragments(files.mediaRuntimeConfig, loaded.mediaRuntimeConfig, [
    "app.read_media_worker_runtime_setting($1)",
  ]);
  requireFragments(files.doc, loaded.doc, [
    "`media-worker-process`",
    "organization_invariant_violation",
    "app_operational_media_worker",
    "Operational Login / Capability Contract",
  ]);
  forbidFragments(files.doc, loaded.doc, [
    "media-worker post-claim business updates run under the claimed job organization",
  ]);
}

function assertOperationalSqlAndDeploy(loaded) {
  requireFragments(files.operationalSql, loaded.operationalSql, [
    "WITH INHERIT FALSE, SET TRUE",
    "app_operational_diagnostic",
    "app_operational_delivery_worker",
    "app_operational_scheduler",
    "app_operational_media_worker",
    "GRANT SELECT ON TABLE integrator.projection_outbox TO app_operational_diagnostic",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE integrator.idempotency_keys TO app_operational_scheduler",
    "CREATE OR REPLACE FUNCTION app.read_media_worker_runtime_setting",
    "CREATE OR REPLACE FUNCTION app.list_scheduler_reminder_organization_ids",
    "CREATE OR REPLACE FUNCTION app.resolve_outgoing_delivery_scope",
    "CREATE OR REPLACE FUNCTION app.operator_incident_alert_already_sent",
    "CREATE OR REPLACE FUNCTION app.mark_operator_incident_alert_sent",
    "CREATE OR REPLACE FUNCTION app.record_operator_delivery_attempt",
    "operator delivery attempt has no exact queue source",
    "p_status = 'success' AND (p_reason IS NULL OR p_reason = 'dev_redirect_suppressed')",
    "p_status = 'failed' AND p_reason = 'provider_rejected'",
    ") IS NOT TRUE",
    "integrator.delivery_attempt_logs",
    "integrator.delivery_attempt_logs_id_seq",
    "scheduler reminder work contains conflicting organization ownership",
    "REVOKE ALL PRIVILEGES ON DATABASE",
    "pg_database object",
    "pg_type object",
    "object.typcategory <> 'A'",
    "pg_shdepend dependency",
    "REVOKE ALL PRIVILEGES ON TYPE",
    "'T'",
    "scheduler reminder work contains rows without organization ownership",
    "REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA",
    "ALTER DEFAULT PRIVILEGES FOR ROLE",
    "c4_catalog_exact_acl_surface_verified",
    "c4_operational_cross_contour_verified",
  ]);
  requireFragmentBefore(
    files.operationalSql,
    loaded.operationalSql,
    "scheduler reminder work contains conflicting organization ownership",
    "scheduler reminder work contains rows without organization ownership",
  );
  requireFragments(files.testDeploy, loaded.testDeploy, [
    "install_c4_operational_runtime_overlay",
    "assert_c4_operational_runtime_ready",
    "DATABASE_URL_DIAGNOSTIC",
    "DATABASE_URL_DELIVERY_WORKER",
    "DATABASE_URL_SCHEDULER",
    "MEDIA_WORKER_ENV",
    "app.record_operator_delivery_attempt(text,text,text,integer,text)",
  ]);
  requireOccurrenceCountAtLeast(files.testDeploy, loaded.testDeploy, "-qAt -c", 4);
  requireOccurrenceCountAtLeast(files.testDeploy, loaded.testDeploy, "::int;", 4);
  requireOccurrenceCountAtLeast(files.testDeploy, loaded.testDeploy, "| tail -n 1", 4);
  requireOccurrenceCountAtLeast(files.testDeploy, loaded.testDeploy, '= "1" ]', 4);
  requireFragments(files.outgoingDeliveryScope, loaded.outgoingDeliveryScope, [
    "app.resolve_outgoing_delivery_scope($1::uuid)",
    "app.operator_incident_alert_already_sent($1::uuid)",
    "app.mark_operator_incident_alert_sent($1::uuid)",
  ]);
  requireFragments(files.outgoingDeliveryWorker, loaded.outgoingDeliveryWorker, [
    "processClaimedOutgoingDeliveryRow",
    "resolveOutgoingDeliveryScope(deps.db, row.id)",
    "TENANT_SCOPE_QUEUE_KIND_MISMATCH",
    "runWithOrganizationPrincipal(scope.organizationId",
    "runWithDeliveryQueueCapability",
  ]);
  requireFragments(files.operatorDeliveryAttempts, loaded.operatorDeliveryAttempts, [
    "mutation.type !== 'delivery.attempt.log'",
    "app.record_operator_delivery_attempt($1, $2, $3, $4, $5)",
  ]);
  requireFragments(files.operatorAttemptWritePort, loaded.operatorAttemptWritePort, [
    "principal?.kind === 'infra'",
    "principal.source === 'worker:outgoing-delivery-tick'",
    "recordOperatorDeliveryAttempt(input.db, mutation)",
    "input.tenantWritePort.writeDb(mutation)",
  ]);
  requireFragments(files.operatorAttemptWritePortTest, loaded.operatorAttemptWritePortTest, [
    "uses the real dispatch chain and narrow operational audit function after provider success",
    "audits a dev-suppressed send without reaching an adapter or tenant transaction",
    "rejects another infra source and delegates an organization principal",
    "sensitive operator alert text",
    "records a redacted failed attempt and rethrows the original provider error",
    "keeps the original provider error when failed-attempt audit persistence also fails",
  ]);
  requireFragments(files.dispatchPort, loaded.dispatchPort, [
    "'failed', 1, 'provider_rejected'",
    "throw providerError",
    "Delivery provider failed and its attempt audit could not be persisted",
  ]);
  requireFragments(files.dispatchPortTest, loaded.dispatchPortTest, [
    "does not mask the provider rejection when failed-attempt audit also fails",
    "params: expect.objectContaining({ status: 'failed', reason: 'provider_rejected' })",
  ]);
  requireFragments(files.reportOperatorFailure, loaded.reportOperatorFailure, [
    "createHmac('sha256', key)",
    "DB_PRINCIPAL_SIGNING_SECRET is required for operator recipient pseudonymization",
    "buildRecipientDigest('telegram', recipientId)",
    "buildRecipientDigest('max', recipientId)",
    "${recipientDigest}",
  ]);
  requireFragments(files.reportOperatorFailureTest, loaded.reportOperatorFailureTest, [
    "keeps raw recipient ids out of queue and audit event identifiers",
    "contains only a recipient digest",
  ]);
  requireFragments(files.integratorDi, loaded.integratorDi, [
    "dispatchAttemptWritePort?: DbWritePort",
    "writePort: input.dispatchAttemptWritePort ?? dbWritePort",
  ]);
  requireFragments(files.workerMain, loaded.workerMain, [
    "createOperatorAwareDeliveryAttemptWritePort",
    "dispatchAttemptWritePort:",
  ]);
  requireFragments(files.operationalReadiness, loaded.operationalReadiness, [
    "SELECT 1 / has_function_privilege",
    "app.record_operator_delivery_attempt(text,text,text,integer,text)",
  ]);
  requireFragments(files.operationalReadinessScript, loaded.operationalReadinessScript, [
    "SELECT 1 / has_function_privilege",
    "app.record_operator_delivery_attempt(text,text,text,integer,text)",
    "tail -n 1",
    "four contours must authenticate as four distinct PostgreSQL roles",
  ]);
  requireFragments(files.operationalProvisionScript, loaded.operationalProvisionScript, [
    "run as root/DB administrator",
    "four operational URLs must use four distinct roles",
    "WEBAPP_ENV_FILE",
    "saas-c2-secret-preflight.mjs",
    '--env-file="webapp:$WEBAPP_ENV_FILE"',
    "sudo -u postgres psql",
    "\\password $role",
    "assert-c4-operational-runtime-ready.sh",
  ]);
}

function assertMediaPresignMatrix(loaded) {
  requireFragments(files.mediaPresign, loaded.mediaPresign, [
    "getCurrentSession",
    "canAccessDoctor",
    "pgValidateUserAssignableMediaFolder",
    "const key = s3ObjectKey(mediaId, parsed.data.filename)",
    "insertPendingMediaFileTx",
    "presignPutUrl(key, mime)",
  ]);
  requireFragments(files.mediaMultipartInit, loaded.mediaMultipartInit, [
    "getCurrentSession",
    "canAccessDoctor",
    "pgValidateUserAssignableMediaFolder",
    "const key = s3ObjectKey(mediaId, parsed.data.filename)",
    "insertUploadSessionTx",
    "s3CreateMultipartUpload",
  ]);
  requireFragments(files.mediaMultipartPartUrl, loaded.mediaMultipartPartUrl, [
    "gateUploadSessionForPartUrl(parsed.data.sessionId, session.user.userId)",
    "presignUploadPartUrl(row.s3_key, row.upload_id, parsed.data.partNumber)",
  ]);
  requireFragments(files.mediaPlayback, loaded.mediaPlayback, [
    "getCurrentSession",
    "getMediaAccessRow(id)",
    "assertMediaPlaybackAccess(session",
    "resolveMediaPlaybackPayload",
  ]);
  requireFragments(files.doc, loaded.doc, [
    "Webapp Media Presign / Upload / Playback Matrix",
    "cross-org folder/key deny",
    "another org/user cannot get part URL for a foreign session/key",
    "cross-org object keys cannot be presigned or proxied",
  ]);
}

function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]),
  );
  for (const entry of expectedInternalRoutes) {
    loaded[entry.source] = overrides[entry.source] ?? read(entry.source);
  }

  requireFragments(files.roadmap, loaded.roadmap, [
    "### Phase C4",
    "Map each scheduler/media/cron job to organization",
    "Prove media claim/transcode metadata flow",
    "Give any unavoidable infra pool its own",
  ]);
  requireFragments(files.t0Checklist, loaded.t0Checklist, [
    "Media-worker context slice",
    "Media-worker claim/reclaim",
    "Media-worker processing/failure/duration writes",
  ]);
  requireFragments(files.doc, loaded.doc, [
    "# C4 scheduler, media-worker and cron/internal-job fanout",
    "No TEST/PROD/S3 execution",
    "This is not the final C4 exit",
    "Remaining C4 Gates",
  ]);

  assertScheduler(loaded);
  assertMediaWorker(loaded);
  assertOperationalSqlAndDeploy(loaded);
  assertWebappInternalRoutesCovered(loaded);
  assertMediaPresignMatrix(loaded);

  const packageJson = JSON.parse(loaded.packageJson);
  const scripts = packageJson.scripts ?? {};
  if (
    scripts["check:saas-c4-scheduler-media-cron-fanout"] !==
    "node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-c4-scheduler-media-cron-fanout.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-c4-scheduler-media-cron-fanout.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-c4-scheduler-media-cron-fanout.mjs --self-test"
  ) {
    fail("package.json has an unexpected check:saas-c4-scheduler-media-cron-fanout script");
  }
}

if (process.argv.includes("--self-test")) {
  const mediaProcess = read(files.mediaProcess).replace(
    "\"media-worker:process-transcode-job\"",
    "\"media-worker:process-transcode-job-missing\"",
  );
  const mediaClaim = read(files.mediaClaim).replace(
    "row.job_organization_id !== row.media_organization_id",
    "false",
  );
  const mediaProcessNoDelegation = read(files.mediaProcess).replace(
    "runWithMediaWorkerInfraPrincipal(\"media-worker:process-transcode-job\"",
    "runWithMediaWorkerInfraOnly(\"media-worker:process-transcode-job\"",
  );
  const mediaWithClient = read(files.mediaWithClient).replace(
    "assertMediaWorkerLockedPrincipalClassified(principalApplyOptions);",
    "// removed by self-test",
  );
  const webpushRoute = read("apps/webapp/src/app/api/internal/reminders/web-push-only/tick/route.ts").replace(
    'source: "api/internal/reminders/web-push-only/tick:POST"',
    'source: "api/internal/reminders/web-push-only/tick-missing:POST"',
  );
  const doc = read(files.doc).replaceAll("`/api/internal/media-transcode/enqueue`", "`/api/internal/media-transcode/enqueue-missing`");
  const operationalSql = read(files.operationalSql).replaceAll("WITH INHERIT FALSE, SET TRUE", "WITH INHERIT TRUE, SET TRUE");
  const operationalSqlNoConflictGate = read(files.operationalSql).replace(
    "scheduler reminder work contains conflicting organization ownership",
    "scheduler reminder conflict gate removed",
  );
  const operationalSqlNoOperatorAudit = read(files.operationalSql).replace(
    "operator delivery attempt has no exact queue source",
    "operator delivery attempt source gate removed",
  );
  const operationalSqlNoCatalogScrub = read(files.operationalSql).replaceAll(
    "REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA",
    "REVOKE SELECT ON ALL ROUTINES IN SCHEMA",
  );
  const operationalSqlNoDatabaseScrub = read(files.operationalSql).replaceAll(
    "REVOKE ALL PRIVILEGES ON DATABASE",
    "REVOKE CONNECT ON DATABASE",
  );
  const operationalSqlWrongAuditSchema = read(files.operationalSql).replaceAll(
    "integrator.delivery_attempt_logs",
    "public.delivery_attempt_logs",
  );
  const operationalProvisionNoPreflight = read(files.operationalProvisionScript).replace(
    "saas-c2-secret-preflight.mjs",
    "saas-c2-secret-preflight-removed.mjs",
  );
  const operationalReadinessNoBooleanGate = read(files.operationalReadiness).replace(
    "SELECT 1 / has_function_privilege",
    "SELECT has_function_privilege",
  );
  const operationalSqlNoTypeScrub = read(files.operationalSql).replaceAll(
    "REVOKE ALL PRIVILEGES ON TYPE",
    "REVOKE USAGE ON TYPE",
  );
  const operationalSqlOpenReason = read(files.operationalSql).replace(
    "OR (p_status = 'failed' AND p_reason = 'provider_rejected')",
    "OR (p_status = 'failed' AND p_reason IS NOT NULL)",
  );
  const testDeployLegacyReadiness = read(files.testDeploy)
    .replaceAll("-qAt -c", "-tAc")
    .replaceAll("::int;", "::text;");
  const dispatchPortNoFailedAudit = read(files.dispatchPort).replace(
    "'failed', 1, 'provider_rejected'",
    "'success', 1, 'provider_rejected'",
  );
  const reportOperatorFailureRawRecipient = read(files.reportOperatorFailure).replaceAll(
    "${recipientDigest}",
    "${recipientId}",
  );
  const cases = [
    { mediaProcess },
    { mediaClaim },
    { mediaProcess: mediaProcessNoDelegation },
    { mediaWithClient },
    { "apps/webapp/src/app/api/internal/reminders/web-push-only/tick/route.ts": webpushRoute },
    { doc },
    { operationalSql },
    { operationalSql: operationalSqlNoConflictGate },
    { operationalSql: operationalSqlNoOperatorAudit },
    { operationalSql: operationalSqlNoCatalogScrub },
    { operationalSql: operationalSqlNoDatabaseScrub },
    { operationalSql: operationalSqlWrongAuditSchema },
    { operationalProvisionScript: operationalProvisionNoPreflight },
    { operationalReadiness: operationalReadinessNoBooleanGate },
    { operationalSql: operationalSqlNoTypeScrub },
    { operationalSql: operationalSqlOpenReason },
    { testDeploy: testDeployLegacyReadiness },
    { dispatchPort: dispatchPortNoFailedAudit },
    { reportOperatorFailure: reportOperatorFailureRawRecipient },
  ];
  let detected = 0;
  for (const testCase of cases) {
    try {
      runChecks(testCase);
    } catch {
      detected += 1;
    }
  }
  if (detected === cases.length) {
    console.log("check-c4-scheduler-media-cron-fanout self-test: OK");
    process.exit(0);
  }
  fail("self-test did not detect all C4 inventory/checker regressions");
}

try {
  runChecks();
  console.log("check-c4-scheduler-media-cron-fanout: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-c4-scheduler-media-cron-fanout: ${message}`);
  process.exit(1);
}

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
  dbPrincipal: "packages/db-principal/src/index.ts",
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
  idempotencyKeys: "apps/integrator/src/infra/db/repos/idempotencyKeys.ts",
  projectionOutbox: "apps/integrator/src/infra/db/repos/projectionOutbox.ts",
  projectionHealthCore: "apps/integrator/src/infra/db/repos/projectionHealthCore.ts",
  jobQueue: "apps/integrator/src/infra/db/repos/jobQueue.ts",
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
  webPushOperationalSql: "deploy/postgres/c4-web-push-reminder-runtime.sql",
  webPushOperationalProof: "deploy/postgres/smoke-c4-web-push-reminder-runtime.sh",
  operationalReadinessScript: "deploy/host/assert-c4-operational-runtime-ready.sh",
  operationalProvisionScript: "deploy/host/provision-c4-operational-runtime.sh",
  operationalPasswordSetter: "deploy/host/set-postgres-role-password.mjs",
  operationalPasswordSmoke: "deploy/host/smoke-set-postgres-role-password.sh",
  operationalTestEnvBootstrap: "deploy/host/bootstrap-c4-test-env.mjs",
  webPushReminderCron: "deploy/host/web-push-only-reminder-cron.sh",
  testDeploy: "deploy/host/deploy-test-saas.sh",
  prodDeploy: "deploy/host/deploy-prod.sh",
  hostDeployReadme: "deploy/HOST_DEPLOY_README.md",
  mediaWorkerTestUnit: "deploy/systemd/bersoncarebot-media-worker-test.service",
  mediaWorkerTestUnitAssertion: "deploy/host/assert-media-worker-test-unit-properties.sh",
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

function requireOrderedFragments(label, text, fragments) {
  let cursor = 0;
  for (const fragment of fragments) {
    const index = text.indexOf(fragment, cursor);
    if (index < 0) fail(`${label} missing or misordered required fragment: ${fragment}`);
    cursor = index + fragment.length;
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
      entry.id === "webpush_reminders"
        ? "WEB_PUSH_ONLY_REMINDER_TICK_DB_SOURCE"
        : `source: "${entry.path.slice(1)}:POST"`,
    ]);
    requireFragmentBefore(
      entry.source,
      routeText,
      "bearerMatchesSecret(token, secret)",
      entry.id === "webpush_reminders"
        ? "enterWithDbInfraPrincipal({ source: WEB_PUSH_ONLY_REMINDER_TICK_DB_SOURCE })"
        : `source: "${entry.path.slice(1)}:POST"`,
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
  requireFragments(files.hostDeployReadme, loaded.hostDeployReadme, [
    "One-time PROD порядок (без фиксации значений секретов в репозитории)",
    "DATABASE_URL_DIAGNOSTIC",
    "DATABASE_URL_DELIVERY_WORKER",
    "DATABASE_URL_SCHEDULER",
    "media-worker.prod",
    "DATABASE_URL_WEB_PUSH_REMINDER",
    "единственный штатный entrypoint",
    "явной операцией re-provision/rotation",
    "Обычный `deploy-prod.sh` эту команду и password setter не вызывает",
    "bash /opt/projects/bersoncarebot/deploy/host/provision-c4-operational-runtime.sh",
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
    "setDbOperationalRuntimeRole(client, role)",
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
    "AS scheduler_organizations(organization_id) LIMIT 0",
  ]);
  requireFragments(files.schedulerOrganizationRepo, loaded.schedulerOrganizationRepo, [
    "app.list_scheduler_reminder_organization_ids()",
    "AS scheduler_organizations(organization_id)",
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
    "j.next_attempt_at IS NULL",
    "j.next_attempt_at <= now()",
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
    'setDbOperationalRuntimeRole(client, "app_operational_media_worker")',
    "const client = await pool.connect();",
  ]);
  requireFragments(files.dbPrincipal, loaded.dbPrincipal, [
    "export async function setDbOperationalRuntimeRole",
    'statement = "SET ROLE app_operational_diagnostic"',
    'statement = "SET ROLE app_operational_delivery_worker"',
    'statement = "SET ROLE app_operational_media_worker"',
    'statement = "SET ROLE app_operational_scheduler"',
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
  requireFragments(files.idempotencyKeys, loaded.idempotencyKeys, [
    "INSERT INTO integrator.idempotency_keys",
    "DELETE FROM integrator.idempotency_keys",
  ]);
  requireFragments(files.projectionOutbox, loaded.projectionOutbox, [
    "FROM integrator.projection_outbox",
    "UPDATE integrator.projection_outbox",
  ]);
  requireOccurrenceCountAtLeast(
    files.projectionHealthCore,
    loaded.projectionHealthCore,
    "FROM integrator.projection_outbox",
    5,
  );
  requireFragments(files.jobQueue, loaded.jobQueue, [
    "FROM integrator.rubitime_create_retry_jobs",
    "UPDATE integrator.rubitime_create_retry_jobs",
  ]);
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
    "array_element.oid = object.typelem AND array_element.typarray = object.oid",
    "pg_shdepend dependency",
    "REVOKE ALL PRIVILEGES ON TYPE",
    "'T'",
    "scheduler reminder work contains rows without organization ownership",
    "REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA",
    "ALTER DEFAULT PRIVILEGES FOR ROLE",
    "c4_catalog_exact_acl_surface_verified",
    "c4_operational_cross_contour_verified",
  ]);
  requireOccurrenceCountAtLeast(
    files.operationalSql,
    loaded.operationalSql,
    "array_element.oid = object.typelem AND array_element.typarray = object.oid",
    5,
  );
  requireFragmentBefore(
    files.operationalSql,
    loaded.operationalSql,
    "scheduler reminder work contains conflicting organization ownership",
    "scheduler reminder work contains rows without organization ownership",
  );
  requireFragments(files.testDeploy, loaded.testDeploy, [
    "bootstrap_and_provision_c4_operational_runtime",
    "reapply_c4_operational_runtime_overlays",
    "assert_c4_operational_runtime_ready",
    "assert_webapp_test_operational_env_available",
    "C4_WEB_PUSH_REMINDER_RUNTIME=deploy/postgres/c4-web-push-reminder-runtime.sql",
    "C4_OPERATIONAL_PROVISIONER=deploy/host/provision-c4-operational-runtime.sh",
    "C4_OPERATIONAL_READINESS=deploy/host/assert-c4-operational-runtime-ready.sh",
    "C4_OPERATIONAL_PASSWORD_SETTER=deploy/host/set-postgres-role-password.mjs",
    "C4_OPERATIONAL_PASSWORD_SMOKE=deploy/host/smoke-set-postgres-role-password.sh",
    'PROJECT_ROOT="$DEPLOY_REPO"',
    'WEBAPP_ENV_FILE="$WEBAPP_ENV"',
    'bash "$DEPLOY_REPO/$C4_OPERATIONAL_PROVISIONER" --bootstrap-test-env',
    "DATABASE_URL_DIAGNOSTIC",
    "DATABASE_URL_DELIVERY_WORKER",
    "DATABASE_URL_SCHEDULER",
    "DATABASE_URL_WEB_PUSH_REMINDER",
    'sudo node "$DEPLOY_REPO/deploy/host/bootstrap-c4-test-env.mjs" --check',
    'sudo node "$SRC_REPO/deploy/host/bootstrap-c4-test-env.mjs" --check',
    'for env_file in "$API_ENV" "$WEBAPP_ENV"; do',
    'if [ -e "$MEDIA_WORKER_ENV" ]; then',
    "MEDIA_WORKER_ENV",
    'c4_web_push_reminder_login_role="$web_push_reminder_role"',
    '-f "$DEPLOY_REPO/$C4_WEB_PUSH_REMINDER_RUNTIME"',
    'bash "$DEPLOY_REPO/$C4_OPERATIONAL_READINESS"',
    'grep -Fxq "$WEBAPP_ENV (ignore_errors=no)"',
    "C4 operational bootstrap/provision: OK (five isolated TEST contours)",
    "C4 operational runtime overlays: OK (five isolated contours)",
    "C4 operational runtime readiness: OK (five distinct URLs; positive + cross-contour negatives)",
    "webapp TEST unit operational env: OK (DATABASE_URL_WEB_PUSH_REMINDER available)",
    "--c4-operational-chain-self-test",
    "run_c4_operational_chain_self_test",
    'bash "$SRC_REPO/$C4_OPERATIONAL_PROVISIONER" --self-test',
    'bash "$SRC_REPO/$C4_OPERATIONAL_PASSWORD_SMOKE"',
    'node "$C4_STATIC_CHECKER" --self-test',
    "C4 canonical fresh wrapper segment self-test: OK (no env/DB/service/cron mutation)",
  ]);
  const strictClosure = loaded.testDeploy.slice(
    loaded.testDeploy.indexOf("run_strict_post_migration_closure(){"),
    loaded.testDeploy.indexOf("\nassert_strict_closure_deploy_checkout_ready(){"),
  );
  requireOrderedFragments(files.testDeploy, strictClosure, [
    'log "strict closure: protected principal helpers"',
    "install_p2_b_protected_principal_context",
    'log "strict closure: reviewed runtime overlays"',
    "rehydrate_post_restore_runtime_overlays",
    'log "strict closure: base policies -> safe specialized overlays -> exact FORCE assertions"',
    "apply_test_strict_rls_finalizer",
    'log "strict closure: C4 five-contour TEST env preflight + root provisioning"',
    "bootstrap_and_provision_c4_operational_runtime",
    'log "strict closure: owner-ready locked DB matrix (transactional)"',
    "run_owner_ready_locked_db_matrix",
    'log "strict closure: post-matrix exact strict + FORCE reassertion"',
    "apply_test_strict_rls_finalizer",
    "reapply_c4_operational_runtime_overlays",
    "assert_c4_operational_runtime_ready",
    'log "strict closure: restart locked TEST units"',
    "install_and_assert_media_worker_test_unit",
    "assert_webapp_test_operational_env_available",
    "mark_e1_runtime_coverage_start",
  ]);
  forbidFragments(files.testDeploy, loaded.testDeploy, [
    "four isolated contours",
    "web-push-only-reminder-cron.sh install-test",
  ]);
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
    "five contours must authenticate as five distinct PostgreSQL roles",
    "app_operational_web_push_reminder",
    "expect_denied",
    "diagnostic cross-contour reminder read",
    "delivery cross-contour web-push read",
    "scheduler cross-contour web-push read",
    "media cross-contour web-push read",
    "web-push base login direct table read",
    "web-push cross-contour scheduler read",
    "web-push cross-contour delivery read",
    "web-push cross-contour media read",
    "web-push staff/nonstaff business-table read",
    "web-push noncanonical operator status key",
    "web-push operator status delete",
    "reminders.web_push_only.tick",
    "web-push exact operator status write/read failed",
    "web-push operator status policy exposed or updated another key",
    "SELECT set_config('app.org', '00000000-0000-4000-8000-000000000001', true)",
    "app.is_staff()",
    "app.current_org_id()",
    "app.current_patient_user_id()",
    "app.current_integrator_user_id()",
  ]);
  requireOccurrenceCountAtLeast(files.operationalReadinessScript, loaded.operationalReadinessScript, "expect_denied", 15);
  requireFragments(files.operationalProvisionScript, loaded.operationalProvisionScript, [
    "#!/usr/bin/env bash\nset +x\nset -euo pipefail",
    "run as root/DB administrator",
    "five operational URLs must use five distinct roles",
    "DATABASE_URL_WEB_PUSH_REMINDER",
    "validate_operational_endpoint",
    "127.0.0.1",
    "5432",
    'validate_test_database "$database"',
    "self-test accepted non-canonical TEST database",
    "TEST operational URLs must target exact database bersoncarebot_test",
    "WEBAPP_ENV_FILE",
    "saas-c2-secret-preflight.mjs",
    '--process-env-file="webapp:$WEBAPP_ENV_FILE"',
    "sudo -u postgres psql",
    '-f - < "$OVERLAY"',
    'PASSWORD_SETTER="$PROJECT_ROOT/deploy/host/set-postgres-role-password.mjs"',
    'printf \'%s\' "$password"',
    'sudo -u postgres node "$PASSWORD_SETTER" "$database" "$role"',
    "assert-c4-operational-runtime-ready.sh",
    "--bootstrap-test-env",
    "--self-test",
    "bootstrap-c4-test-env.mjs",
    '[ "$PROJECT_ROOT" = "/opt/projects/bersoncarebot-test" ]',
    "provision-c4-operational-runtime self-test: OK",
  ]);
  forbidFragments(files.operationalProvisionScript, loaded.operationalProvisionScript, [
    "\\password",
    "-v password=",
    "--password=",
  ]);
  requireFragments(files.operationalPasswordSetter, loaded.operationalPasswordSetter, [
    'createRequire(new URL("../../apps/webapp/package.json", import.meta.url))',
    'const { Client } = require("pg")',
    "const identifier = /^[a-z_][a-z0-9_]*$/",
    "chunk.includes(0x0d)",
    "const newline = chunk.indexOf(0x0a)",
    "newline !== chunk.length - 1",
    "passwordBuffer.length > 4096",
    "passwordBuffer.fill(0)",
    "SET log_statement = 'none'",
    "SET log_min_messages = 'panic'",
    "SET log_min_error_statement = 'panic'",
    "SET log_min_duration_statement = -1",
    "SET log_parameter_max_length = 0",
    "SET log_parameter_max_length_on_error = 0",
    "current_setting('pgaudit.log', true)",
    "set_config('pgaudit.log', 'none', false)",
    "CREATE OR REPLACE FUNCTION pg_temp.bcb_set_role_password",
    "EXECUTE format('ALTER ROLE %I PASSWORD %L', p_role, p_password)",
    'client.query("SELECT pg_temp.bcb_set_role_password($1, $2)", [role, password])',
    "PostgreSQL role password updated: OK",
    "Deliberately suppress all driver/server diagnostics",
  ]);
  forbidFragments(files.operationalPasswordSetter, loaded.operationalPasswordSetter, [
    "\\password",
    "-v password=",
    "--password=",
    "mktemp",
    "set -x",
    "error.message",
    "console.error(error",
  ]);
  requireFragments(files.operationalPasswordSmoke, loaded.operationalPasswordSmoke, [
    "local all all scram-sha-256",
    "canonical sudo/stdin helper invocation failed",
    'script -E never -qefc "$pty_command"',
    "PTY stdin helper invocation prompted, hung, or failed",
    "post-bind server error exposed a non-generic client diagnostic",
    "old credential remained valid after rotation",
    "secret leaked to captured output",
    "raw secret leaked to live process arguments",
    "encoded secret leaked to live process arguments",
    "process-argument harness failed",
    "raw or encoded secret persisted in PostgreSQL logs",
    "unsafe identifier was accepted",
    "provisioner did not disable inherited xtrace",
    "temporary secret artifacts remain",
    "C4 noninteractive PostgreSQL role password smoke: OK (sudo stdin + PTY + rotation + forced-log no-leak)",
  ]);
  requireFragments(files.operationalTestEnvBootstrap, loaded.operationalTestEnvBootstrap, [
    'media: "/opt/env/bersoncarebot/media-worker.test"',
    'database !== "bersoncarebot_test"',
    "randomBytes(32)",
    "root:deploy 0640",
    "writeProtected(mediaPath",
    "writeProtected(apiPath",
    "writeProtected(webappPath",
    "DATABASE_URL_WEB_PUSH_REMINDER",
    '!["--check", "--execute"].includes(process.argv[2])',
    'write = process.argv[2] === "--execute"',
    "C4 TEST env bootstrap preflight: OK (no files written; secrets redacted)",
    "bootstrap accepted an unreadable source env",
    "source validation failure created media-worker.test",
    "source validation failure modified an existing env file",
  ]);
  requireFragments(files.webPushOperationalSql, loaded.webPushOperationalSql, [
    "app_operational_web_push_reminder",
    "NOLOGIN NOINHERIT NOBYPASSRLS",
    "WITH INHERIT FALSE, SET TRUE",
    "app.list_web_push_reminder_organization_ids",
    "app_web_push_reminder_discovery_definer",
    "c4_web_push_reminder_discovery",
    "c4_web_push_reminder_org",
    "reminders.web_push_only.tick",
    "c4_web_push_reminder_down",
    "DOWN is repeat-safe",
    "DROP ROLE IF EXISTS app_operational_web_push_reminder",
    "granted.rolname IN (:'c4_web_push_reminder_login_role'",
    "app.is_staff(),\n  app.current_org_id(),\n  app.current_patient_user_id(),\n  app.current_integrator_user_id()",
    "REVOKE ALL PRIVILEGES ON FUNCTION\n  app.is_staff(),\n  app.current_org_id(),\n  app.current_patient_user_id(),\n  app.current_integrator_user_id()\nFROM PUBLIC;",
    'FROM :"c4_web_push_reminder_login_role" CASCADE',
    "FROM app_web_push_reminder_discovery_definer CASCADE",
    "FROM app_operational_web_push_reminder CASCADE",
    "GRANT EXECUTE ON FUNCTION\n  app.is_staff(),\n  app.current_org_id(),\n  app.current_patient_user_id(),\n  app.current_integrator_user_id()\nTO app_operational_web_push_reminder;",
    "pg_get_userbyid(routine.proowner) <> 'app_owner'",
    "acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'",
    "SELECT * FROM actual EXCEPT SELECT * FROM expected",
    "SELECT * FROM expected EXCEPT SELECT * FROM actual",
    "c4_web_push_helper_acl_exact",
    "saas_enforce_default_deny_p0_9_1",
    "AS RESTRICTIVE TO app_operational_web_push_reminder",
    "capability.oid = ANY (policy.polroles)",
    "policy_inventory",
    "expected_acl(rolname, privilege_type, is_grantable)",
    "('app_operational_web_push_reminder', 'SELECT', false)",
    "('app_operational_web_push_reminder', 'INSERT', false)",
    "('app_operational_web_push_reminder', 'UPDATE', false)",
    "NOT polpermissive AND polcmd = '*'",
    "CROSS JOIN LATERAL aclexplode(attribute.attacl) acl",
    "AND NOT EXISTS (SELECT 1 FROM column_acl)",
    "REVOKE ALL PRIVILEGES ON public.operator_job_status FROM PUBLIC",
    "c4_web_push_operator_status_acl_policy_exact",
  ]);
  requireOccurrenceCountAtLeast(files.webPushOperationalSql, loaded.webPushOperationalSql, 'FROM :"c4_web_push_reminder_login_role" CASCADE', 2);
  requireOccurrenceCountAtLeast(files.webPushOperationalSql, loaded.webPushOperationalSql, "FROM app_web_push_reminder_discovery_definer CASCADE", 2);
  requireOccurrenceCountAtLeast(files.webPushOperationalSql, loaded.webPushOperationalSql, "FROM app_operational_web_push_reminder CASCADE", 2);
  requireOccurrenceCountAtLeast(files.webPushOperationalSql, loaded.webPushOperationalSql, "app.current_integrator_user_id()\nFROM PUBLIC;", 2);
  requireOccurrenceCountAtLeast(files.webPushOperationalSql, loaded.webPushOperationalSql, "capability.oid = ANY (policy.polroles)", 2);
  requireOccurrenceCountAtLeast(files.webPushOperationalSql, loaded.webPushOperationalSql, "CROSS JOIN LATERAL aclexplode(attribute.attacl) acl", 3);
  requireFragments(files.webPushOperationalProof, loaded.webPushOperationalProof, [
    "failed to inject overgrant rehearsal",
    "reapply retained injected overgrant",
    "injected overgrant did not make the readiness-negative surface reachable",
    "reapply left the readiness-negative surface reachable",
    "GRANT SELECT ON public.outside_contour TO c4_webpush_smoke_login",
    "GRANT SELECT ON public.outside_contour TO app_operational_web_push_reminder",
    "GRANT SELECT ON public.outside_contour TO app_web_push_reminder_discovery_definer",
    "helper-dependent readiness unexpectedly passed before overlay grant",
    "CREATE POLICY pre_overlay_locked_helper_dependency ON public.webapp_reminder_occurrences",
    "SELECT set_config('app.org','11111111-1111-4111-8111-111111111111',false); SELECT count(*) FROM public.webapp_reminder_occurrences;",
    "permission denied for function current_org_id",
    "helper-dependent readiness did not pass after overlay",
    "GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id()",
    "TO PUBLIC",
    "TO c4_webpush_smoke_login",
    "TO app_web_push_reminder_discovery_definer",
    "TO app_operational_web_push_reminder WITH GRANT OPTION",
    'helper_acl" = "4:4:0"',
    "reapply did not restore exact helper ACL",
    "DOWN retained base-login helper EXECUTE",
    "pre-overlay proof did not reproduce permissive operator status exposure",
    "CREATE POLICY saas_enforce_default_deny_p0_9_1",
    "CREATE POLICY injected_c4_status_permissive",
    "GRANT UPDATE (last_status) ON public.operator_job_status TO c4_webpush_smoke_login",
    "GRANT SELECT (job_key) ON public.operator_job_status TO app_web_push_reminder_discovery_definer",
    "GRANT REFERENCES (job_key) ON public.operator_job_status TO app_operational_web_push_reminder",
    "GRANT UPDATE (last_status) ON public.operator_job_status TO PUBLIC",
    "failed to inject operator status column-ACL drift",
    'status_policy_acl" = "3:1:0:0:0:0:0"',
    "reapply did not restore exact operator status policy/ACL",
    "exact operator status transaction failed",
    "noncanonical operator status insert passed",
    "operator status delete passed",
    "restrictive C4 policy broke the intended legacy operator contour",
    "CREATE POLICY injected_c4_status_down_drift",
    "repeated role-absent DOWN was not idempotent",
    'down_status_state" = "1:1:0:0:0"',
    "DOWN did not preserve only legacy operator policy and scrub base/column/PUBLIC ACL",
    "C4 Web Push reminder private PostgreSQL 16 proof: OK",
  ]);
  requireOccurrenceCountAtLeast(files.webPushOperationalProof, loaded.webPushOperationalProof, "app.current_integrator_user_id(), app.is_staff() TO PUBLIC;", 2);
  requireOccurrenceCountAtLeast(files.webPushOperationalProof, loaded.webPushOperationalProof, "TO app_operational_web_push_reminder WITH GRANT OPTION", 2);
  requireFragments(files.webPushReminderCron, loaded.webPushReminderCron, [
    'JOB_NAME="bersoncarebot-test-web-push-only-reminders"',
    'node "$CRONPORT" set',
    'http://127.0.0.1:6300/api/internal/reminders/web-push-only/tick?limit=50',
    '"Authorization: Bearer $INTERNAL_JOB_SECRET"',
  ]);
  requireFragments(files.mediaWorkerTestUnit, loaded.mediaWorkerTestUnit, [
    "User=deploy",
    "Group=deploy",
    "WorkingDirectory=/opt/projects/bersoncarebot-test/apps/media-worker",
    "EnvironmentFile=/opt/env/bersoncarebot/media-worker.test",
  ]);
  requireFragments(files.testDeploy, loaded.testDeploy, [
    "-p FragmentPath --value",
    "-p EnvironmentFiles --value",
    'bash "$DEPLOY_REPO/$MEDIA_WORKER_TEST_UNIT_ASSERTION" --validate',
  ]);
  requireFragments(files.mediaWorkerTestUnitAssertion, loaded.mediaWorkerTestUnitAssertion, [
    "EXPECTED_FRAGMENT_PATH=/etc/systemd/system/bersoncarebot-media-worker-test.service",
    "EXPECTED_ENV_FILE=/opt/env/bersoncarebot/media-worker.test",
    '[ "$fragment_path" = "$EXPECTED_FRAGMENT_PATH" ]',
    "^/opt/env/bersoncarebot/media-worker\\.test[[:space:]]+\\(ignore_errors=(yes|no)\\)$",
    "$EXPECTED_ENV_FILE.bak",
    "/opt/env/bersoncarebot/extra.test",
    "assert-media-worker-test-unit-properties self-test: OK",
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
  requireFragments(files.doc, loaded.doc, [
    "PROD env credentials are prepared once by the operator before that initial provision",
    "ordinary code deploy/migrate never invokes",
    "only checks the already-provisioned contract",
  ]);
  requireOrderedFragments(files.prodDeploy, loaded.prodDeploy, [
    "pnpm --dir apps/webapp run migrate",
    'bash "${PROJECT_ROOT}/${C4_OPERATIONAL_READINESS}"',
    'sudo -n /bin/systemctl restart "${API_SERVICE}"',
  ]);
  forbidFragments(files.prodDeploy, loaded.prodDeploy, [
    "provision-c4-operational-runtime.sh",
    "set-postgres-role-password.mjs",
    "bootstrap-c4-test-env.mjs",
  ]);
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
  const webpushRoute = read("apps/webapp/src/app/api/internal/reminders/web-push-only/tick/route.ts").replaceAll(
    "WEB_PUSH_ONLY_REMINDER_TICK_DB_SOURCE",
    "REMINDER_DB_SOURCE_MISSING",
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
  const operationalProvisionNoBootstrap = read(files.operationalProvisionScript).replace(
    "bootstrap-c4-test-env.mjs",
    "bootstrap-c4-test-env-removed.mjs",
  );
  const operationalProvisionNoPasswordSetter = read(files.operationalProvisionScript).replace(
    'sudo -u postgres node "$PASSWORD_SETTER" "$database" "$role"',
    'sudo -u postgres psql -d "$database"',
  );
  const operationalProvisionXtraceEnabled = read(files.operationalProvisionScript).replace(
    "#!/usr/bin/env bash\nset +x\nset -euo pipefail",
    "#!/usr/bin/env bash\nset -euo pipefail",
  );
  const operationalPasswordSetterSqlLeak = read(files.operationalPasswordSetter).replace(
    'client.query("SELECT pg_temp.bcb_set_role_password($1, $2)", [role, password])',
    'client.query(`SELECT pg_temp.bcb_set_role_password(\'${role}\', \'${password}\')`)',
  );
  const operationalPasswordSetterOutputLeak = read(files.operationalPasswordSetter).replace(
    "} catch {",
    "} catch (error) { console.error(error);",
  );
  const operationalPasswordSmokeNoPty = read(files.operationalPasswordSmoke).replace(
    "PTY stdin helper invocation prompted, hung, or failed",
    "PTY proof removed",
  );
  const operationalProvisionOpenProjectRoot = read(files.operationalProvisionScript).replace(
    '[ "$PROJECT_ROOT" = "/opt/projects/bersoncarebot-test" ]',
    '[ -n "$PROJECT_ROOT" ]',
  );
  const operationalProvisionOpenTestDatabase = read(files.operationalProvisionScript).replace(
    'validate_test_database "$database"',
    ': "$database"',
  );
  const schedulerReadinessWithoutScalarAlias = read(files.operationalReadiness).replace(
    " AS scheduler_organizations(organization_id)",
    "",
  );
  const schedulerRepoWithoutScalarAlias = read(files.schedulerOrganizationRepo).replace(
    " AS scheduler_organizations(organization_id)",
    "",
  );
  const mediaWorkerTestUnitWrongRoot = read(files.mediaWorkerTestUnit).replace(
    "/opt/projects/bersoncarebot-test/apps/media-worker",
    "/home/deploy/projects/bersoncarebot-test/apps/media-worker",
  );
  const mediaWorkerAssertionOpenFragment = read(files.mediaWorkerTestUnitAssertion).replace(
    '[ "$fragment_path" = "$EXPECTED_FRAGMENT_PATH" ]',
    '[ -n "$fragment_path" ]',
  );
  const mediaWorkerAssertionSubstringEnv = read(files.mediaWorkerTestUnitAssertion).replace(
    "[[ \"$environment_files\" =~ ^/opt/env/bersoncarebot/media-worker\\.test[[:space:]]+\\(ignore_errors=(yes|no)\\)$ ]]",
    '[[ "$environment_files" == *"$EXPECTED_ENV_FILE"* ]]',
  );
  const operationalReadinessNoBooleanGate = read(files.operationalReadiness).replace(
    "SELECT 1 / has_function_privilege",
    "SELECT has_function_privilege",
  );
  const operationalReadinessNoCrossContourDeny = read(files.operationalReadinessScript).replace(
    'expect_denied "$web_push_reminder_url" "web-push cross-contour scheduler read"',
    'probe "$web_push_reminder_url" "web-push cross-contour scheduler read"',
  );
  const operationalReadinessWrongStatusKey = read(files.operationalReadinessScript).replaceAll(
    "reminders.web_push_only.tick",
    "readiness.wrong-key",
  );
  const operationalReadinessNoStatusDeleteDeny = read(files.operationalReadinessScript).replace(
    'expect_denied "$web_push_reminder_url" "web-push operator status delete"',
    'probe "$web_push_reminder_url" "web-push operator status delete"',
  );
  const operationalSqlNoTypeScrub = read(files.operationalSql).replaceAll(
    "REVOKE ALL PRIVILEGES ON TYPE",
    "REVOKE USAGE ON TYPE",
  );
  const operationalSqlCategoryArrayFilter = read(files.operationalSql).replaceAll(
    "array_element.oid = object.typelem AND array_element.typarray = object.oid",
    "object.typcategory <> 'A'",
  );
  const operationalSqlOpenReason = read(files.operationalSql).replace(
    "OR (p_status = 'failed' AND p_reason = 'provider_rejected')",
    "OR (p_status = 'failed' AND p_reason IS NOT NULL)",
  );
  const webPushOperationalProofNoOvergrantRehearsal = read(files.webPushOperationalProof).replace(
    "GRANT SELECT ON public.outside_contour TO app_operational_web_push_reminder;",
    "-- removed injected operational overgrant",
  );
  const webPushOperationalSqlNoHelperGrant = read(files.webPushOperationalSql).replace(
    "GRANT EXECUTE ON FUNCTION\n  app.is_staff(),\n  app.current_org_id(),\n  app.current_patient_user_id(),\n  app.current_integrator_user_id()\nTO app_operational_web_push_reminder;",
    "-- removed protected-context helper grant",
  );
  const webPushOperationalSqlPublicHelperOvergrant = read(files.webPushOperationalSql).replaceAll(
    "REVOKE ALL PRIVILEGES ON FUNCTION\n  app.is_staff(),\n  app.current_org_id(),\n  app.current_patient_user_id(),\n  app.current_integrator_user_id()\nFROM PUBLIC;",
    "GRANT EXECUTE ON FUNCTION app.current_org_id() TO PUBLIC;",
  );
  const webPushOperationalSqlNoHelperAclAssertion = read(files.webPushOperationalSql).replace(
    "c4_web_push_helper_acl_exact",
    "c4_web_push_helper_acl_removed",
  );
  const webPushOperationalProofNoBeforeGrantFailure = read(files.webPushOperationalProof).replace(
    "permission denied for function current_org_id",
    "pre-overlay helper failure proof removed",
  );
  const webPushOperationalProofNoLockedPolicy = read(files.webPushOperationalProof).replace(
    "CREATE POLICY pre_overlay_locked_helper_dependency ON public.webapp_reminder_occurrences",
    "-- removed locked helper dependency policy",
  );
  const webPushOperationalProofNoHelperOvergrant = read(files.webPushOperationalProof).replaceAll(
    "TO app_operational_web_push_reminder WITH GRANT OPTION",
    "helper grant-option rehearsal removed",
  );
  const webPushOperationalSqlNoStatusRestriction = read(files.webPushOperationalSql).replace(
    "AS RESTRICTIVE TO app_operational_web_push_reminder",
    "TO app_operational_web_push_reminder",
  );
  const webPushOperationalSqlNoTargetedPolicyScrub = read(files.webPushOperationalSql).replaceAll(
    "capability.oid = ANY (policy.polroles)",
    "false",
  );
  const webPushOperationalSqlNoStatusInventory = read(files.webPushOperationalSql).replace(
    "c4_web_push_operator_status_acl_policy_exact",
    "c4_web_push_operator_status_acl_policy_removed",
  );
  const webPushOperationalSqlNoStatusColumnAcl = read(files.webPushOperationalSql).replaceAll(
    "CROSS JOIN LATERAL aclexplode(attribute.attacl) acl",
    "CROSS JOIN LATERAL aclexplode(NULL::aclitem[]) acl",
  );
  const webPushOperationalProofNoStatusExposure = read(files.webPushOperationalProof).replace(
    "pre-overlay proof did not reproduce permissive operator status exposure",
    "pre-overlay status exposure proof removed",
  );
  const webPushOperationalProofNoInjectedStatusPolicy = read(files.webPushOperationalProof).replace(
    "CREATE POLICY injected_c4_status_permissive",
    "-- removed injected permissive status policy",
  );
  const webPushOperationalProofNoStatusDownDrift = read(files.webPushOperationalProof).replace(
    "CREATE POLICY injected_c4_status_down_drift",
    "-- removed DOWN status policy drift",
  );
  const webPushOperationalSqlNoRepeatSafeDown = read(files.webPushOperationalSql).replace(
    "DOWN is repeat-safe",
    "DOWN repeat safety removed",
  );
  const webPushOperationalProofNoRepeatedDown = read(files.webPushOperationalProof).replace(
    "repeated role-absent DOWN was not idempotent",
    "repeated DOWN proof removed",
  );
  const operationalReadinessScriptNoWebPushHelperProbe = read(files.operationalReadinessScript).replace(
    "SELECT set_config('app.org', '00000000-0000-4000-8000-000000000001', true)",
    "SELECT 'web-push helper readiness removed'",
  );
  const testDeployNoBootstrapProvisionCall = read(files.testDeploy).replace(
    "  bootstrap_and_provision_c4_operational_runtime\n",
    "  # removed bootstrap/provision call\n",
  );
  const prodDeployNoC4Readiness = read(files.prodDeploy).replace(
    'bash "${PROJECT_ROOT}/${C4_OPERATIONAL_READINESS}"',
    "# removed C4 readiness",
  );
  const prodDeployCallsProvision = `${read(files.prodDeploy)}\nbash deploy/host/provision-c4-operational-runtime.sh\n`;
  const hostDeployReadmeNoOneTimeC4 = read(files.hostDeployReadme).replace(
    "One-time PROD порядок (без фиксации значений секретов в репозитории)",
    "removed one-time PROD C4 runbook",
  );
  const testDeployWrongPostMatrixOrder = read(files.testDeploy).replace(
    "  reapply_c4_operational_runtime_overlays\n  assert_c4_operational_runtime_ready\n",
    "  assert_c4_operational_runtime_ready\n  reapply_c4_operational_runtime_overlays\n",
  );
  const testDeployNoUnitEnvGate = read(files.testDeploy).replace(
    "  assert_webapp_test_operational_env_available\n",
    "  # removed webapp operational env gate\n",
  );
  const testDeployNoFiveContourOutput = read(files.testDeploy).replace(
    "C4 operational runtime readiness: OK (five distinct URLs; positive + cross-contour negatives)",
    "C4 operational runtime readiness: OK",
  );
  const testDeployNoBootstrapInputCheck = read(files.testDeploy).replace(
    '  sudo node "$DEPLOY_REPO/deploy/host/bootstrap-c4-test-env.mjs" --check\n',
    "  # removed missing-media bootstrap preflight\n",
  );
  const dispatchPortNoFailedAudit = read(files.dispatchPort).replace(
    "'failed', 1, 'provider_rejected'",
    "'success', 1, 'provider_rejected'",
  );
  const reportOperatorFailureRawRecipient = read(files.reportOperatorFailure).replaceAll(
    "${recipientDigest}",
    "${recipientId}",
  );
  const idempotencyKeysUnqualified = read(files.idempotencyKeys).replaceAll(
    "integrator.idempotency_keys",
    "idempotency_keys",
  );
  const projectionOutboxUnqualified = read(files.projectionOutbox).replaceAll(
    "integrator.projection_outbox",
    "projection_outbox",
  );
  const projectionHealthCoreUnqualified = read(files.projectionHealthCore).replaceAll(
    "integrator.projection_outbox",
    "projection_outbox",
  );
  const jobQueueUnqualified = read(files.jobQueue).replaceAll(
    "integrator.rubitime_create_retry_jobs",
    "rubitime_create_retry_jobs",
  );
  const mediaClaimAmbiguousRetry = read(files.mediaClaim).replaceAll(
    "j.next_attempt_at",
    "next_attempt_at",
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
    { operationalProvisionScript: operationalProvisionNoBootstrap },
    { operationalProvisionScript: operationalProvisionNoPasswordSetter },
    { operationalProvisionScript: operationalProvisionXtraceEnabled },
    { operationalPasswordSetter: operationalPasswordSetterSqlLeak },
    { operationalPasswordSetter: operationalPasswordSetterOutputLeak },
    { operationalPasswordSmoke: operationalPasswordSmokeNoPty },
    { operationalProvisionScript: operationalProvisionOpenProjectRoot },
    { operationalProvisionScript: operationalProvisionOpenTestDatabase },
    { operationalReadiness: schedulerReadinessWithoutScalarAlias },
    { schedulerOrganizationRepo: schedulerRepoWithoutScalarAlias },
    { mediaWorkerTestUnit: mediaWorkerTestUnitWrongRoot },
    { mediaWorkerTestUnitAssertion: mediaWorkerAssertionOpenFragment },
    { mediaWorkerTestUnitAssertion: mediaWorkerAssertionSubstringEnv },
    { operationalReadiness: operationalReadinessNoBooleanGate },
    { operationalReadinessScript: operationalReadinessNoCrossContourDeny },
    { operationalReadinessScript: operationalReadinessWrongStatusKey },
    { operationalReadinessScript: operationalReadinessNoStatusDeleteDeny },
    { operationalSql: operationalSqlNoTypeScrub },
    { operationalSql: operationalSqlCategoryArrayFilter },
    { operationalSql: operationalSqlOpenReason },
    { webPushOperationalProof: webPushOperationalProofNoOvergrantRehearsal },
    { webPushOperationalSql: webPushOperationalSqlNoHelperGrant },
    { webPushOperationalSql: webPushOperationalSqlPublicHelperOvergrant },
    { webPushOperationalSql: webPushOperationalSqlNoHelperAclAssertion },
    { webPushOperationalProof: webPushOperationalProofNoBeforeGrantFailure },
    { webPushOperationalProof: webPushOperationalProofNoLockedPolicy },
    { webPushOperationalProof: webPushOperationalProofNoHelperOvergrant },
    { webPushOperationalSql: webPushOperationalSqlNoStatusRestriction },
    { webPushOperationalSql: webPushOperationalSqlNoTargetedPolicyScrub },
    { webPushOperationalSql: webPushOperationalSqlNoStatusInventory },
    { webPushOperationalSql: webPushOperationalSqlNoStatusColumnAcl },
    { webPushOperationalProof: webPushOperationalProofNoStatusExposure },
    { webPushOperationalProof: webPushOperationalProofNoInjectedStatusPolicy },
    { webPushOperationalProof: webPushOperationalProofNoStatusDownDrift },
    { webPushOperationalSql: webPushOperationalSqlNoRepeatSafeDown },
    { webPushOperationalProof: webPushOperationalProofNoRepeatedDown },
    { operationalReadinessScript: operationalReadinessScriptNoWebPushHelperProbe },
    { testDeploy: testDeployNoBootstrapProvisionCall },
    { prodDeploy: prodDeployNoC4Readiness },
    { prodDeploy: prodDeployCallsProvision },
    { hostDeployReadme: hostDeployReadmeNoOneTimeC4 },
    { testDeploy: testDeployWrongPostMatrixOrder },
    { testDeploy: testDeployNoUnitEnvGate },
    { testDeploy: testDeployNoFiveContourOutput },
    { testDeploy: testDeployNoBootstrapInputCheck },
    { dispatchPort: dispatchPortNoFailedAudit },
    { reportOperatorFailure: reportOperatorFailureRawRecipient },
    { idempotencyKeys: idempotencyKeysUnqualified },
    { projectionOutbox: projectionOutboxUnqualified },
    { projectionHealthCore: projectionHealthCoreUnqualified },
    { jobQueue: jobQueueUnqualified },
    { mediaClaim: mediaClaimAmbiguousRetry },
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

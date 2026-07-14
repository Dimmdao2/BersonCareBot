#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const repoRoot = process.cwd();

const files = {
  doc: "docs/_TODO/SAAS_FOUNDATION/SAAS_C4_SCHEDULER_MEDIA_CRON_FANOUT.md",
  roadmap: "docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md",
  t0Checklist: "docs/_TODO/SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md",
  scheduler: "apps/integrator/src/infra/runtime/scheduler/main.ts",
  mediaMain: "apps/media-worker/src/main.ts",
  mediaWorkerTick: "apps/media-worker/src/workerTick.ts",
  mediaClaim: "apps/media-worker/src/jobs/claim.ts",
  mediaWithClient: "apps/media-worker/src/withClient.ts",
  mediaPoolProvider: "apps/media-worker/src/poolProvider.ts",
  mediaProcess: "apps/media-worker/src/processTranscodeJob.ts",
  mediaPrincipalTest: "apps/media-worker/src/processTranscodeJob.principal.test.ts",
  mediaWithClientTest: "apps/media-worker/src/withClient.test.ts",
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

function requireFragmentBefore(label, text, before, after) {
  const beforeIndex = text.indexOf(before);
  const afterIndex = text.indexOf(after);
  if (beforeIndex < 0) fail(`${label} missing required fragment: ${before}`);
  if (afterIndex < 0) fail(`${label} missing required fragment: ${after}`);
  if (beforeIndex > afterIndex) {
    fail(`${label} must contain ${before} before ${after}`);
  }
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
    "runWithInfraPrincipal({ source: 'scheduler:handle-tick-event' }",
    "type: 'schedule.tick'",
  ]);
  requireFragmentBefore(files.scheduler, loaded.scheduler, "runWithInfraPrincipal({ source: 'scheduler:acquire-lock' }", "const { buildDeps }");
  requireFragments(files.doc, loaded.doc, [
    "`scheduler-lock`",
    "`scheduler-tick`",
    "`scheduler:acquire-lock`",
    "`scheduler:handle-tick-event`",
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
    "organization_id = COALESCE(j.organization_id, mf.organization_id)",
    "RETURNING j.id, j.media_id, j.organization_id, j.attempts",
    "organizationId: job.organization_id",
  ]);
  requireFragments(files.mediaWithClient, loaded.mediaWithClient, [
    "allowedLockedInfraSources",
    "\"media-worker:tick\"",
    "export function assertMediaWorkerLockedPrincipalClassified",
    "DB principal context is required before media-worker scoped DB access in locked mode",
    "DB infra principal source is not allowed on media-worker pool in locked mode",
    "DB bootstrap principal source is not allowed on media-worker pool in locked mode",
    "DB patient principal is not allowed on media-worker pool in locked mode",
    "DB staff principal is not allowed on media-worker pool in locked mode",
    "DB integrator principal is not allowed on media-worker pool in locked mode",
    "assertMediaWorkerLockedPrincipalClassified(principalApplyOptions);",
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
    "createDbOrganizationPrincipal",
    "source: \"media-worker:process-transcode-job\"",
    "media-worker transcode job is missing organization_id in locked mode",
    "media-worker:process-transcode-job:legacy-missing-org",
  ]);
  requireFragments(files.mediaPrincipalTest, loaded.mediaPrincipalTest, [
    "runs DB access under the claimed job organization principal",
    "media-worker:process-transcode-job",
    "fails closed before S3 or DB work when locked mode sees a job without organization_id",
    "expect(query).not.toHaveBeenCalled();",
  ]);
  requireFragments(files.mediaWithClientTest, loaded.mediaWithClientTest, [
    "fails closed in locked mode before checkout when no DB principal is active",
    "rejects missing locked DB principal before pool.query checkout",
    "rejectedLockedDbPrincipals",
    "name: \"patient\"",
    "name: \"staff\"",
    "name: \"integrator\"",
    "rejects ${testCase.name} locked DB principal before transaction checkout",
    "rejects ${testCase.name} locked DB principal before pool.query checkout",
    "expect(pool.connect).not.toHaveBeenCalled();",
    "expect(connect).not.toHaveBeenCalled();",
  ]);
  requireFragments(files.doc, loaded.doc, [
    "`media-worker-process`",
    "`media-worker:process-transcode-job`",
    "missing org fails closed in locked mode before S3/DB work",
    "separate operational DB login/pool/grants contract",
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
    "No live DB/S3/TEST/PROD execution",
    "This is not the final C4 exit",
    "Remaining C4 Gates",
  ]);

  assertScheduler(loaded);
  assertMediaWorker(loaded);
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
    "source: \"media-worker:process-transcode-job\"",
    "source: \"media-worker:process-transcode-job-missing\"",
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
  const cases = [
    { mediaProcess },
    { mediaWithClient },
    { "apps/webapp/src/app/api/internal/reminders/web-push-only/tick/route.ts": webpushRoute },
    { doc },
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

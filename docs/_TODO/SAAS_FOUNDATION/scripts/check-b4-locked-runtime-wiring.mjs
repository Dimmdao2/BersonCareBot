#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();

const files = {
  dbPrincipal: "packages/db-principal/src/index.ts",
  webappEnv: "apps/webapp/src/config/env.ts",
  webappWithClient: "apps/webapp/src/infra/db/withClient.ts",
  webappPoolProvider: "apps/webapp/src/infra/db/webappPoolProvider.ts",
  webappEnvExample: "apps/webapp/.env.example",
  rootEnvExample: ".env.example",
  integratorEnv: "apps/integrator/src/config/env.ts",
  integratorWithClient: "apps/integrator/src/infra/db/withClient.ts",
  integratorPoolProvider: "apps/integrator/src/infra/db/integratorPoolProvider.ts",
  schedulerLocks: "apps/integrator/src/infra/db/repos/schedulerLocks.ts",
  mediaEnv: "apps/media-worker/src/env.ts",
  mediaWithClient: "apps/media-worker/src/withClient.ts",
  mediaPoolProvider: "apps/media-worker/src/poolProvider.ts",
  webappAuthService: "apps/webapp/src/modules/auth/service.ts",
  webappRequireRole: "apps/webapp/src/app-layer/guards/requireRole.ts",
  webappBootstrapPrincipal: "apps/webapp/src/app-layer/principal/bootstrapPrincipal.ts",
  webappSessionPrincipal: "apps/webapp/src/app-layer/principal/sessionPrincipal.ts",
  webappPatientOrganizationService: "apps/webapp/src/modules/patient-organization/service.ts",
  webappPatientOrganizationRepo: "apps/webapp/src/infra/repos/pgPatientOrganization.ts",
  webappAuthPhoneStartRoute: "apps/webapp/src/app/api/auth/phone/start/route.ts",
  webappPublicBookingCreateRoute: "apps/webapp/src/app/api/booking/public/create/route.ts",
  integratorPrincipal: "apps/integrator/src/infra/principal/organizationPrincipal.ts",
  telegramWebhook: "apps/integrator/src/integrations/telegram/webhook.ts",
  maxWebhook: "apps/integrator/src/integrations/max/webhook.ts",
  mediaProcessTranscodeJob: "apps/media-worker/src/processTranscodeJob.ts",
  phase2: "docs/_TODO/SAAS_FOUNDATION/PHASE2_ORCHESTRATION.md",
  phase1: "docs/_TODO/SAAS_FOUNDATION/PHASE1_LOCKED_LABEL_PROOF.md",
  master: "docs/_TODO/SAAS_FOUNDATION/R2_MVP_MASTER_CHECKLIST.md",
};

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function fail(message) {
  throw new Error(message);
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
  if (beforeIndex < 0) {
    fail(`${label} missing required fragment: ${before}`);
  }
  if (afterIndex < 0) {
    fail(`${label} missing required fragment: ${after}`);
  }
  if (beforeIndex > afterIndex) {
    fail(`${label} must build DB principal apply options before checkout/connect`);
  }
}

function forbidRuntimeDefaultPrincipalCalls(path, text) {
  const forbidden = [
    /applyCurrentDbPrincipalToConnection\(client\)/,
    /applyCurrentDbPrincipalToTransaction\(client\)/,
    /clearDbPrincipalFromConnection\(client\)/,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      fail(`${path} must pass DbPrincipalApplyOptions instead of calling ${pattern}`);
    }
  }
}

function listRouteFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...listRouteFiles(path));
      continue;
    }
    if (name === "route.ts") {
      out.push(path);
    }
  }
  return out;
}

function collectScopedDbTouchingRoutesMissingPrincipalSource() {
  const apiRoot = join(repoRoot, "apps/webapp/src/app/api");
  const scopedRouteRe = /^(admin|doctor|patient|booking)\//;
  const dbSignals = [
    "buildAppDeps(",
    "getPool(",
    "getDrizzle(",
    "@/infra/db",
    "@/infra/repos",
    "createPg",
    "drizzle",
    ".query(",
  ];
  const principalSources = [
    "requireDoctorApiSession",
    "requireDoctorWorkspaceApiContext",
    "requireAdminWorkspaceApiContext",
    "requirePatientApiBusinessAccess",
    "requirePatientApiSessionWithPhone",
    "requirePatientBookingTrustedPhoneAccess",
    "requireAdminModeSession",
    "requireAdminBookingEngine",
    "requireDoctorBookingEngine",
    "getCurrentSession",
    "stampBootstrapPrincipal",
  ];

  return listRouteFiles(apiRoot).flatMap((path) => {
    const relFromApi = relative(apiRoot, path).replace(/\\/g, "/");
    if (!scopedRouteRe.test(relFromApi) || relFromApi.startsWith("booking/public/")) return [];
    const text = readFileSync(path, "utf8");
    if (!dbSignals.some((signal) => text.includes(signal))) return [];
    if (principalSources.some((source) => text.includes(source))) return [];
    return [relative(repoRoot, path).replace(/\\/g, "/")];
  });
}

function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]),
  );

  requireFragments(files.dbPrincipal, loaded.dbPrincipal, [
    "export type DbPrincipalApplyOptions",
    "export const DB_PRINCIPAL_CONTEXT_MODE_ENV = \"DB_PRINCIPAL_CONTEXT_MODE\"",
    "export const DB_PRINCIPAL_SIGNING_SECRET_ENV = \"DB_PRINCIPAL_SIGNING_SECRET\"",
    "export const DB_PRINCIPAL_STAFF_ROLE = \"app_staff\"",
    "export const DB_PRINCIPAL_PATIENT_ROLE = \"app_patient\"",
    "export function buildDbPrincipalApplyOptions(",
    "export function buildDbPrincipalApplyOptionsFromEnv(",
    "export function enterWithDbPrincipal(",
    "type DbPrincipalContextCell",
    "export function ensureDbPrincipalContext(",
    "export function enterWithDbStaffPrincipal(",
    "export function enterWithDbPatientPrincipal(",
    "export function enterWithDbIntegratorPrincipal(",
    "export function enterWithDbBootstrapPrincipal(",
    "DB principal context is required before scoped DB access in locked mode",
    "DB principal context is missing before scoped DB access in shadow mode",
    "SET ROLE ${dbRuntimeRoleForPrincipal(principal)}",
    "SELECT app.release_principal_context()",
    "RESET ROLE",
  ]);

  for (const [label, text] of [
    [files.webappEnv, loaded.webappEnv],
    [files.integratorEnv, loaded.integratorEnv],
    [files.mediaEnv, loaded.mediaEnv],
    [files.webappEnvExample, loaded.webappEnvExample],
    [files.rootEnvExample, loaded.rootEnvExample],
  ]) {
    requireFragments(label, text, [
      "DB_PRINCIPAL_CONTEXT_MODE",
      "DB_PRINCIPAL_SIGNING_SECRET",
      "legacy-guc",
      "shadow",
      "locked",
    ]);
  }

  for (const [label, text] of [
    [files.webappWithClient, loaded.webappWithClient],
    [files.webappPoolProvider, loaded.webappPoolProvider],
    [files.integratorWithClient, loaded.integratorWithClient],
    [files.integratorPoolProvider, loaded.integratorPoolProvider],
    [files.mediaWithClient, loaded.mediaWithClient],
    [files.mediaPoolProvider, loaded.mediaPoolProvider],
  ]) {
    requireFragments(label, text, [
      "buildDbPrincipalApplyOptionsFromEnv",
      "principalApplyOptions",
      "applyCurrentDbPrincipalToConnection(client,",
      "clearDbPrincipalFromConnection(client,",
    ]);
    forbidRuntimeDefaultPrincipalCalls(label, text);
    requireFragmentBefore(label, text, "principalApplyOptions", "pool.connect()");
  }

  for (const [label, text] of [
    [files.webappPoolProvider, loaded.webappPoolProvider],
    [files.integratorPoolProvider, loaded.integratorPoolProvider],
    [files.mediaPoolProvider, loaded.mediaPoolProvider],
  ]) {
    requireFragments(label, text, ["Callback-form pool.query is forbidden"]);
  }

  for (const [label, text] of [
    [files.webappWithClient, loaded.webappWithClient],
    [files.integratorWithClient, loaded.integratorWithClient],
    [files.mediaWithClient, loaded.mediaWithClient],
  ]) {
    requireFragments(label, text, [
      "applyCurrentDbPrincipalToTransaction(client,",
    ]);
  }

  requireFragments(files.schedulerLocks, loaded.schedulerLocks, [
    "destroyPreparedIntegratorClient",
    "releasePreparedIntegratorClient",
    "await releasePreparedIntegratorClient(client)",
  ]);
  if (/client\.release\(\)/.test(loaded.schedulerLocks)) {
    fail(`${files.schedulerLocks} must not bypass prepared-client cleanup with raw client.release()`);
  }

  requireFragments(files.integratorWithClient, loaded.integratorWithClient, [
    "WeakMap<PoolClient, DbPrincipalApplyOptions>",
    "rememberPreparedClient",
    "getPreparedClientOptions",
    "destroyPreparedIntegratorClient",
  ]);

  requireFragments(files.webappRequireRole, loaded.webappRequireRole, [
    "ensureDbPrincipalContext",
    "enterWithDbStaffPrincipal",
    "enterWithDbPatientPrincipal",
    "ensureDbPrincipalContext({ source: \"requireDoctorWorkspaceApiContext:pending\" })",
    "ensureDbPrincipalContext({ source: \"requirePatientApiBusinessAccess:pending\" })",
    "stampStaffPrincipal(resolved.ctx, \"requireDoctorWorkspaceApiContext\")",
    "stampStaffPrincipal(resolved.ctx, \"requireAdminWorkspaceApiContext\")",
    "stampPatientPrincipalForApi(session)",
    "resolveActiveOrganizationForPatient(session.user.userId)",
  ]);

  requireFragments(files.webappBootstrapPrincipal, loaded.webappBootstrapPrincipal, [
    "enterWithDbBootstrapPrincipal",
    "export function stampBootstrapPrincipal(",
  ]);

  requireFragments(files.webappSessionPrincipal, loaded.webappSessionPrincipal, [
    "stampDbPrincipalFromSession",
    "ensureDbPrincipalContext",
    "enterWithDbStaffPrincipal",
    "enterWithDbPatientPrincipal",
    "resolveActiveOrganizationForPatient",
    "resolveOrganizationForUser",
  ]);

  requireFragments(files.webappAuthService, loaded.webappAuthService, [
    "dbPrincipalContextModeRequiresSessionStamp",
    "mode === \"shadow\" || mode === \"locked\"",
    "stampDbPrincipalFromSession",
    "finalizeCurrentSession",
  ]);

  requireFragments(files.webappPatientOrganizationService, loaded.webappPatientOrganizationService, [
    "resolveActiveOrganizationForPatient",
    "no_active_enrollment",
    "organization_selection_required",
  ]);

  requireFragments(files.webappPatientOrganizationRepo, loaded.webappPatientOrganizationRepo, [
    "orgEnrollments",
    "eq(orgEnrollments.status, \"active\")",
    "orderBy(asc(orgEnrollments.createdAt), asc(orgEnrollments.organizationId))",
  ]);

  for (const [label, text] of [
    [files.webappAuthPhoneStartRoute, loaded.webappAuthPhoneStartRoute],
    [files.webappPublicBookingCreateRoute, loaded.webappPublicBookingCreateRoute],
  ]) {
    requireFragments(label, text, [
      "stampBootstrapPrincipal",
    ]);
  }

  requireFragments(files.integratorPrincipal, loaded.integratorPrincipal, [
    "runWithDbIntegratorPrincipal",
    "runWithIntegratorPrincipal",
  ]);

  for (const [label, text] of [
    [files.telegramWebhook, loaded.telegramWebhook],
    [files.maxWebhook, loaded.maxWebhook],
  ]) {
    requireFragments(label, text, [
      "runWithIntegratorPrincipal",
      "resolveIntegratorUserIdForMessenger",
      "integratorUserId",
      "runWithOrganizationPrincipal",
    ]);
  }

  requireFragments(files.mediaProcessTranscodeJob, loaded.mediaProcessTranscodeJob, [
    "runWithOptionalMediaWorkerOrganizationPrincipal(job.organizationId",
  ]);

  const missingPrincipalRoutes = collectScopedDbTouchingRoutesMissingPrincipalSource();
  if (missingPrincipalRoutes.length > 0) {
    fail(`SCOPED DB-touching webapp routes missing a principal source:\n${missingPrincipalRoutes.join("\n")}`);
  }

  const docsEvidence = [loaded.phase2, loaded.phase1, loaded.master].join("\n");
  requireFragments("B4 docs evidence", docsEvidence, [
    "#688",
    "DB_PRINCIPAL_CONTEXT_MODE",
    "DB_PRINCIPAL_SIGNING_SECRET",
    "legacy-guc",
    "shadow",
    "locked",
    "app_staff",
    "app_patient",
  ]);
}

if (process.argv.includes("--self-test")) {
  const webappPoolProvider = read(files.webappPoolProvider).replace(
    "applyCurrentDbPrincipalToConnection(client, principalApplyOptions)",
    "applyCurrentDbPrincipalToConnection(client)",
  );
  try {
    runChecks({ webappPoolProvider });
  } catch {
    console.log("check-b4-locked-runtime-wiring self-test: OK");
    process.exit(0);
  }
  fail("self-test did not detect default principal apply call");
}

try {
  runChecks();
  console.log("check-b4-locked-runtime-wiring: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-b4-locked-runtime-wiring: ${message}`);
  process.exit(1);
}

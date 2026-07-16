#!/usr/bin/env node
import { readFileSync } from "node:fs";

const files = {
  migration: "apps/webapp/db/drizzle-migrations/0193_e1_safe_runtime_config.sql",
  overlay: "deploy/postgres/e1-webapp-runtime-config.sql",
  runtime: "apps/webapp/src/modules/system-settings/runtimeConfig.ts",
  adapter: "apps/webapp/src/modules/system-settings/configAdapter.ts",
  publicSnapshot: "apps/webapp/src/modules/auth/publicAuthSnapshot.ts",
  oauthProviders: "apps/webapp/src/app/api/auth/oauth/providers/route.ts",
  patientMaintenance: "apps/webapp/src/modules/system-settings/patientMaintenance.ts",
  maintenanceScreen: "apps/webapp/src/app/app/patient/PatientMaintenanceScreen.tsx",
  playback: "apps/webapp/src/app-layer/media/resolveMediaPlaybackPayload.ts",
  phoneStart: "apps/webapp/src/app/api/auth/phone/start/route.ts",
  authObservability: "apps/webapp/src/modules/auth/authRouteObservability.ts",
  authExchange: "apps/webapp/src/app/api/auth/exchange/route.ts",
  presignTtl: "apps/webapp/src/app-layer/media/videoPresignTtl.ts",
  operationContext: "apps/webapp/src/infra/db/saasIsolationOperationContext.ts",
  pgRuntime: "apps/webapp/src/infra/repos/pgAppRuntimeSettings.ts",
  diagnostics: "apps/webapp/src/modules/operator-health/saasIsolationDiagnostics.ts",
  deploy: "deploy/host/deploy-test-saas.sh",
  journal: "apps/webapp/db/drizzle-migrations/meta/_journal.json",
  dbRegression: "scripts/check-saas-db-regression.mjs",
};

function read(path) { return readFileSync(path, "utf8"); }
function fail(message) { throw new Error(message); }
function requireText(label, text, fragments) {
  for (const fragment of fragments) if (!text.includes(fragment)) fail(`${label} missing: ${fragment}`);
}
function forbidText(label, text, fragments) {
  for (const fragment of fragments) if (text.includes(fragment)) fail(`${label} forbidden: ${fragment}`);
}

function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]));
  requireText(files.migration, loaded.migration, [
    "0193_e1_safe_runtime_config",
    "oauth_yandex_enabled", "oauth_google_enabled", "oauth_apple_enabled",
    "public_sms_fallback_enabled", "patient_booking_url",
    "debug_forward_to_admin", "video_presign_ttl_seconds",
    "'public'", "'authenticated_client'", "'server'",
    "count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 5",
    "CREATE OR REPLACE FUNCTION public.sync_registered_app_runtime_setting()",
    "CREATE OR REPLACE FUNCTION app.read_public_runtime_setting(p_key text, p_scope text)",
    "SECURITY DEFINER", "ALTER FUNCTION app.read_public_runtime_setting(text, text) OWNER TO app_owner",
    "GRANT SELECT ON TABLE public.app_runtime_settings TO app_owner",
    "REVOKE ALL ON FUNCTION app.read_public_runtime_setting(text, text) FROM PUBLIC",
    "CREATE OR REPLACE FUNCTION app.read_webapp_server_runtime_setting(p_key text, p_scope text)",
    "setting.audience = 'server'",
    "setting.key IN ('debug_forward_to_admin', 'video_presign_ttl_seconds')",
    "REVOKE ALL ON FUNCTION app.read_webapp_server_runtime_setting(text, text) FROM app_patient, app_staff",
    "REVOKE ALL ON TABLE public.system_settings FROM app_patient",
    "Never provide a global fallback for a clinic-owned booking destination",
    "NEW.key = 'patient_booking_url'", "NEW.organization_id IS NULL",
    "GRANT SELECT ON TABLE public.app_runtime_settings TO app_patient",
    "('webapp','public_auth_config')", "('webapp','patient_runtime_config')",
    "('webapp','public_booking_config')",
  ]);
  forbidText(files.migration, loaded.migration, [
    "GRANT SELECT ON TABLE public.system_settings TO app_patient",
    "GRANT SELECT ON TABLE public.system_settings TO PUBLIC",
  ]);
  requireText(files.overlay, loaded.overlay, [
    "0193_e1_safe_runtime_config.sql", "e1_webapp_runtime_role",
    "GRANT EXECUTE ON FUNCTION app.read_public_runtime_setting(text, text)",
    "GRANT EXECUTE ON FUNCTION app.read_webapp_server_runtime_setting(text, text)",
    "NOT has_function_privilege(",
    "NOT has_table_privilege(:'e1_webapp_runtime_role', 'public.system_settings', 'SELECT')",
  ]);
  requireText(files.runtime, loaded.runtime, [
    '"public_auth_config"', '"patient_runtime_config"', '"public_booking_config"',
    "getPublicBoolean", "getPublicString", "getAuthenticatedBoolean", "getAuthenticatedString",
    "getServerBoolean", "getServerInteger", "public_sms_fallback_enabled: false",
    'allowGlobalFallback: key !== "patient_booking_url"',
  ]);
  requireText(files.adapter, loaded.adapter, [
    "getPublicRuntimeBool", "getPublicRuntimeValue", "getPatientRuntimeBool", "getPatientRuntimeValue",
    "getServerRuntimeBool", "getServerRuntimeInteger",
    "return envFallback;",
  ]);
  forbidText(files.adapter, loaded.adapter, ["return getConfigBool(key, envFallback);"]);
  for (const text of [loaded.publicSnapshot, loaded.oauthProviders]) {
    requireText("public oauth availability", text, [
      'getPublicRuntimeBool("oauth_yandex_enabled")',
      'getPublicRuntimeBool("oauth_google_enabled")',
      'getPublicRuntimeBool("oauth_apple_enabled")',
    ]);
    forbidText("public oauth availability", text, [
      "getYandexOauthClientSecret", "getGoogleClientSecret", "getAppleOauthPrivateKey",
      "getYandexOauthClientId", "getGoogleClientId", "getAppleOauthClientId",
    ]);
  }
  requireText(files.patientMaintenance, loaded.patientMaintenance, [
    "getPatientRuntimeBool", "getPatientRuntimeValue", "organizationId: string | null",
    "organizationId === null", "Promise.resolve(\"\")",
    "resolvePatientMaintenanceOrganizationId",
  ]);
  forbidText(files.patientMaintenance, loaded.patientMaintenance, [
    "dmitryberson.rubitime.ru", "DEFAULT_PATIENT_BOOKING_URL",
  ]);
  requireText(files.maintenanceScreen, loaded.maintenanceScreen, [
    "bookingUrl: string | null", "safeExternal ? (",
  ]);
  requireText(files.playback, loaded.playback, [
    'getPatientRuntimeBool("video_playback_api_enabled")',
    'getPatientRuntimeValue("video_default_delivery")',
  ]);
  requireText(files.operationContext, loaded.operationContext, [
    "AsyncLocalStorage", '"public_auth_config"', '"patient_runtime_config"', '"public_booking_config"',
  ]);
  requireText(files.pgRuntime, loaded.pgRuntime, [
    "FROM app.read_public_runtime_setting($1, $2)",
    'input.allowedAudiences[0] === "public"',
    "FROM app.read_webapp_server_runtime_setting($1, $2)",
    'input.allowedAudiences[0] === "server"',
    'runWithDbBootstrapPrincipal({ source: "webapp-server-runtime-config" }',
    "input.allowGlobalFallback !== false",
  ]);
  requireText(files.phoneStart, loaded.phoneStart, [
    'getPublicRuntimeBool("public_sms_fallback_enabled")',
  ]);
  requireText(files.authObservability, loaded.authObservability, [
    'getServerRuntimeBool("debug_forward_to_admin")',
  ]);
  requireText(files.authExchange, loaded.authExchange, [
    'getServerRuntimeBool("debug_forward_to_admin")',
  ]);
  requireText(files.presignTtl, loaded.presignTtl, [
    'getServerRuntimeInteger("video_presign_ttl_seconds")',
  ]);
  for (const text of [loaded.phoneStart, loaded.authObservability, loaded.authExchange, loaded.presignTtl]) {
    forbidText("closed E1 call chain", text, [
      "getSmsFallbackEnabled", "getConfigBool", "getConfigPositiveInt", "getConfigValue",
    ]);
  }
  requireText(files.diagnostics, loaded.diagnostics, [
    '"public_auth_config"', '"patient_runtime_config"', '"public_booking_config"',
  ]);
  requireText(files.deploy, loaded.deploy, [
    "E1_WEBAPP_RUNTIME_CONFIG=deploy/postgres/e1-webapp-runtime-config.sql",
    'e1_webapp_runtime_role="$e1_runtime_role"',
    '"$DEPLOY_REPO/$E1_WEBAPP_RUNTIME_CONFIG"',
  ]);
  requireText(files.journal, loaded.journal, ['"idx": 193', '"tag": "0193_e1_safe_runtime_config"']);
  requireText(files.dbRegression, loaded.dbRegression, [
    '"docs/_TODO/SAAS_FOUNDATION/scripts/check-e1-webapp-runtime-config.mjs"',
    '"--self-test"',
  ]);
}

if (process.argv.includes("--self-test")) {
  const cases = [
    ["patient system_settings grant", { migration: read(files.migration).replace("REVOKE ALL ON TABLE public.system_settings FROM app_patient", "-- removed") }],
    ["oauth source cardinality", { migration: read(files.migration).replaceAll("count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 5", "true") }],
    ["public generic fallback", { adapter: read(files.adapter).replace("return envFallback;", "return getConfigBool(key, envFallback);") }],
    ["public OAuth secret read", { publicSnapshot: `${read(files.publicSnapshot)}\nvoid getGoogleClientSecret();\n` }],
    ["patient organization scope", { patientMaintenance: read(files.patientMaintenance).replace("organizationId: string | null", "organizationId: string") }],
    ["patient booking null guard", { patientMaintenance: read(files.patientMaintenance).replace("organizationId === null", "false") }],
    ["operation attribution", { operationContext: read(files.operationContext).replace('  | "public_booking_config";', ";") }],
    ["public accessor", { pgRuntime: read(files.pgRuntime).replace("FROM app.read_public_runtime_setting($1, $2)", "FROM public.app_runtime_settings") }],
    ["server accessor", { pgRuntime: read(files.pgRuntime).replace("FROM app.read_webapp_server_runtime_setting($1, $2)", "FROM public.app_runtime_settings") }],
    ["legacy SMS read", { phoneStart: `${read(files.phoneStart)}\nvoid getSmsFallbackEnabled();\n` }],
    ["legacy server read", { presignTtl: `${read(files.presignTtl)}\nvoid getConfigPositiveInt();\n` }],
    ["deploy overlay", { deploy: read(files.deploy).replace("E1_WEBAPP_RUNTIME_CONFIG=deploy/postgres/e1-webapp-runtime-config.sql", "E1_WEBAPP_RUNTIME_CONFIG=") }],
  ];
  let detected = 0;
  const missed = [];
  for (const [label, testCase] of cases) {
    try { runChecks(testCase); missed.push(label); } catch { detected += 1; }
  }
  if (missed.length > 0) fail(`self-test missed: ${missed.join(", ")}`);
  if (detected !== cases.length) fail(`self-test detected ${detected}/${cases.length}`);
  console.log("check-e1-webapp-runtime-config self-test: OK");
} else {
  runChecks();
  console.log("check-e1-webapp-runtime-config: OK");
}

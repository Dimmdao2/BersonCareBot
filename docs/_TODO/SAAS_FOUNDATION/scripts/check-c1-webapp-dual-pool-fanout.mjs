#!/usr/bin/env node
import { readFileSync } from "node:fs";

const files = {
  dbPrincipal: "packages/db-principal/src/index.ts",
  provider: "apps/webapp/src/infra/db/webappPoolProvider.ts",
  withClient: "apps/webapp/src/infra/db/withClient.ts",
  providerTest: "apps/webapp/src/infra/db/webappPoolProvider.test.ts",
  withClientTest: "apps/webapp/src/infra/db/withClient.test.ts",
  doc: "docs/_TODO/SAAS_FOUNDATION/SAAS_C1_WEBAPP_DUAL_POOL_FANOUT.md",
  roadmap: "docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md",
};

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(path, "utf8");
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
    fail(`${label} must contain ${before} before ${after}`);
  }
}

function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]),
  );

  requireFragments(files.roadmap, loaded.roadmap, [
    "### Phase C1",
    "Pool selection happens before checkout",
    "Missing and `infra` fail closed in locked mode.",
    "RESET ROLE",
  ]);

  requireFragments(files.dbPrincipal, loaded.dbPrincipal, [
    "export function assertDbPrincipalRequestPoolCheckoutAllowed(",
    "options.mode !== \"locked\"",
    "DB principal context is required before scoped DB access in locked mode",
    "DB infra principal is not allowed to use the webapp request DB pool in locked mode",
  ]);

  requireFragments(files.provider, loaded.provider, [
    "assertDbPrincipalRequestPoolCheckoutAllowed",
    "assertRoutedWebappPoolCheckoutAllowed",
    "choosePoolKindForPrincipal(principal, input.metrics) === \"staff\" ? input.staffPool : input.nonstaffPool",
    // 28.07: список видов принципала, уходящих в персональный пул, расширен на `clinicBilling`
    // (§29 владельца — биллинг клиники сузили до отдельной роли). Это НЕ форматирование, а смена
    // смысла, поэтому эталон обновлён осознанно: биллинг клиники обязан ходить через персональный
    // пул, иначе `SET ROLE app_clinic_billing` некуда применить и оба пути к биллингу падают —
    // ровно тот блокер релиза, который держал выкатку.
    "principal?.kind === \"organization\" ||\n    principal?.kind === \"staff\" ||\n    principal?.kind === \"clinicBilling\" ||\n    principal?.kind === \"platform\"",
    "getWebappPoolRoutingMetrics",
  ]);
  requireFragmentBefore(
    files.provider,
    loaded.provider,
    "assertRoutedWebappPoolCheckoutAllowed(principal, input.metrics);",
    "choosePoolKindForPrincipal(principal, input.metrics)",
  );
  requireFragmentBefore(
    files.provider,
    loaded.provider,
    "assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(principalSnapshot, principalApplyOptions);",
    "const client = await pool.connect();",
  );

  requireFragments(files.withClient, loaded.withClient, [
    "assertDbPrincipalRequestPoolCheckoutAllowed",
    "const principalApplyOptions = getDbPrincipalApplyOptions();",
    "await clearDbPrincipalFromConnection(client, options, principal);",
    "client.release(cleanupError instanceof Error ? cleanupError : new Error(\"DB principal cleanup failed\"))",
  ]);
  requireFragmentBefore(
    files.withClient,
    loaded.withClient,
    "assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(principalSnapshot, principalApplyOptions);",
    "const client = await pool.connect();",
  );

  requireFragments(files.providerTest, loaded.providerTest, [
    "routes staff and organization-scoped principals to the staff pool before checkout",
    "routes the platform principal through staff transport, SET ROLEs narrowly, and cleans up",
    "routes patient, bootstrap, and missing principals to the nonstaff pool before checkout",
    "rejects missing and infra principals before dual-pool checkout in locked mode",
    "DB infra principal is not allowed to use the webapp request DB pool in locked mode",
    "expect(pools[0]?.connect).not.toHaveBeenCalled();",
    "expect(pools[1]?.connect).not.toHaveBeenCalled();",
  ]);

  requireFragments(files.withClientTest, loaded.withClientTest, [
    "fails closed in locked mode before checkout when no DB principal is active",
    "fails closed in locked mode before checkout for infra principal",
    "expect(pool.connect).not.toHaveBeenCalled();",
    "uses locked DB principal options when opt-in env is set",
    "expect(query.mock.calls.at(-1)).toEqual([\"RESET ROLE\"]);",
  ]);

  requireFragments(files.doc, loaded.doc, [
    "# C1 webapp dual-pool fanout",
    "missing and infra principals fail closed in locked mode before checkout",
    "pool routing metrics remain exposed through `getWebappPoolRoutingMetrics`",
    "No TEST/PROD/prod-copy database execution.",
  ]);
}

if (process.argv.includes("--self-test")) {
  const provider = read(files.provider).replace(
    "assertRoutedWebappPoolCheckoutAllowed(principal, input.metrics);",
    "// removed by self-test",
  );
  try {
    runChecks({ provider });
  } catch {
    console.log("check-c1-webapp-dual-pool-fanout self-test: OK");
    process.exit(0);
  }
  fail("self-test did not detect missing routed pre-checkout guard");
}

try {
  runChecks();
  console.log("check-c1-webapp-dual-pool-fanout: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-c1-webapp-dual-pool-fanout: ${message}`);
  process.exit(1);
}

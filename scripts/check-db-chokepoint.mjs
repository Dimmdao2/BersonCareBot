#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const scanRoots = ["apps/webapp/src", "apps/integrator/src", "apps/media-worker/src"];

const allowedPoolProviderFiles = new Set([
  "apps/webapp/src/infra/db/webappPoolProvider.ts",
  "apps/webapp/src/infra/db/integratorPurgePoolProvider.ts",
  "apps/integrator/src/infra/db/integratorPoolProvider.ts",
  "apps/integrator/src/infra/db/integratorMigrationPoolProvider.ts",
  "apps/integrator/src/infra/scripts/projectionHealthPoolProvider.ts",
  "apps/integrator/src/infra/scripts/stage6HistoricalBackfillPoolProvider.ts",
  "apps/media-worker/src/poolProvider.ts",
]);

const allowedConnectFiles = new Set([
  "apps/webapp/src/infra/db/withClient.ts",
  "apps/integrator/src/infra/db/withClient.ts",
  "apps/media-worker/src/withClient.ts",
  // One-off ops backfill keeps paired sessions + SAVEPOINT flow by ADR Class C.
  "apps/integrator/src/infra/scripts/stage6-historical-time-backfill.ts",
]);

const allowedLayerRawSqlFiles = new Set([
  // S1 residual: SQL fragments intentionally kept until dedicated cleanup/guard allowlist decision.
  "apps/webapp/src/modules/analytics/analyticsAudience.ts",
  "apps/webapp/src/modules/booking-rubitime-bridge/recoverExistingProjection.ts",
  "apps/webapp/src/modules/doctor-clients/activeMessengerBindingSql.ts",
  // App-layer Drizzle SQL metric fragments; S5 protects against growth while preserving current behavior.
  "apps/webapp/src/app-layer/health/adminReminderPipelineMetrics.ts",
  "apps/webapp/src/app-layer/health/adminWebPushHealthMetrics.ts",
  "apps/webapp/src/app-layer/media/adminPlaybackHealthMetrics.ts",
  "apps/webapp/src/app-layer/media/hlsProxyErrorEvents.ts",
  "apps/webapp/src/app-layer/media/playbackClientEvents.ts",
  "apps/webapp/src/app-layer/media/playbackHourlyRetention.ts",
  "apps/webapp/src/app-layer/media/playbackStatsHourly.ts",
  "apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts",
  "apps/webapp/src/app-layer/stats/reminderNotificationPeopleStats.ts",
]);

function listTsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      out.push(...listTsFiles(path));
      continue;
    }
    if (
      name.endsWith(".ts") &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".spec.ts") &&
      !name.endsWith(".d.ts") &&
      !name.includes(".devDb.")
    ) {
      out.push(path);
    }
  }
  return out;
}

function isCommentOrDocLine(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function countRuntimeMatches(src, pattern) {
  return src
    .split("\n")
    .filter((line) => !isCommentOrDocLine(line) && pattern.test(line)).length;
}

function isGuardedLayerFile(rel) {
  if (rel.startsWith("apps/webapp/src/modules/")) return true;
  if (rel.startsWith("apps/webapp/src/app-layer/")) return true;
  if (!rel.startsWith("apps/webapp/src/app/")) return false;
  return rel.endsWith("/route.ts") || rel.endsWith("/page.tsx") || rel.endsWith("/actions.ts");
}

function countLayerRawSqlMatches(src) {
  return countRuntimeMatches(
    src,
    /runWebappPgText|runWebappSql|runPgPoolPgText|\bpool\.query\b|\bclient\.query\b|sql`|\bSELECT\s|\bINSERT\s+INTO\b|\bUPDATE\s|\bDELETE\s+FROM\b/i,
  );
}

function collectOffenders(files) {
  const poolOffenders = [];
  const connectOffenders = [];
  const layerRawSqlOffenders = [];

  for (const abs of files) {
    const rel = relative(repoRoot, abs).replace(/\\/g, "/");
    const src = readFileSync(abs, "utf8");
    const poolCount = countRuntimeMatches(src, /\bnew\s+(?:pg\.)?(?:Pg)?Pool\b/);
    if (poolCount > 0 && !allowedPoolProviderFiles.has(rel)) {
      poolOffenders.push(`${rel} (${poolCount}x new Pool)`);
    }

    const connectCount = countRuntimeMatches(src, /\.connect\(/);
    if (connectCount > 0 && !allowedConnectFiles.has(rel)) {
      connectOffenders.push(`${rel} (${connectCount}x .connect())`);
    }

    const rawSqlCount = isGuardedLayerFile(rel) ? countLayerRawSqlMatches(src) : 0;
    if (rawSqlCount > 0 && !allowedLayerRawSqlFiles.has(rel)) {
      layerRawSqlOffenders.push(`${rel} (${rawSqlCount}x layer SQL signal)`);
    }
  }

  return { poolOffenders, connectOffenders, layerRawSqlOffenders };
}

function printOffenders(label, offenders) {
  if (offenders.length === 0) return;
  console.error(`check-db-chokepoint: ${label}`);
  for (const offender of offenders) console.error(`  - ${offender}`);
}

if (process.argv.includes("--self-test")) {
  const virtualRel = "apps/webapp/src/app/api/example/route.ts";
  const virtualAbs = join(repoRoot, virtualRel);
  const originalReadFileSync = readFileSync;
  const syntheticConnectionString = ["postgres", "://example"].join("");
  const syntheticSource = `
    import { Pool } from "pg";
    const pool = new Pool({ connectionString: "${syntheticConnectionString}" });
    await pool.connect();
    await pool.query("SELECT 1");
  `;
  const files = [virtualAbs];
  const poolOffenders = [];
  const connectOffenders = [];
  const layerRawSqlOffenders = [];
  for (const abs of files) {
    const rel = relative(repoRoot, abs).replace(/\\/g, "/");
    const src = abs === virtualAbs ? syntheticSource : originalReadFileSync(abs, "utf8");
    const poolCount = countRuntimeMatches(src, /\bnew\s+(?:pg\.)?(?:Pg)?Pool\b/);
    if (poolCount > 0 && !allowedPoolProviderFiles.has(rel)) {
      poolOffenders.push(`${rel} (${poolCount}x new Pool)`);
    }
    const connectCount = countRuntimeMatches(src, /\.connect\(/);
    if (connectCount > 0 && !allowedConnectFiles.has(rel)) {
      connectOffenders.push(`${rel} (${connectCount}x .connect())`);
    }
    const rawSqlCount = isGuardedLayerFile(rel) ? countLayerRawSqlMatches(src) : 0;
    if (rawSqlCount > 0 && !allowedLayerRawSqlFiles.has(rel)) {
      layerRawSqlOffenders.push(`${rel} (${rawSqlCount}x layer SQL signal)`);
    }
  }
  if (poolOffenders.length === 1 && connectOffenders.length === 1 && layerRawSqlOffenders.length === 1) {
    console.log("check-db-chokepoint self-test: OK");
    process.exit(0);
  }
  console.error("check-db-chokepoint self-test: expected synthetic offenders were not detected");
  process.exit(1);
}

const files = scanRoots.flatMap((root) => listTsFiles(join(repoRoot, root)));
const { poolOffenders, connectOffenders, layerRawSqlOffenders } = collectOffenders(files);

printOffenders("new Pool outside named DB pool providers:", poolOffenders);
printOffenders(".connect() outside checkout helpers / documented ops KEEP:", connectOffenders);
printOffenders("raw SQL in guarded layers outside S5 allowlist:", layerRawSqlOffenders);

if (poolOffenders.length > 0 || connectOffenders.length > 0 || layerRawSqlOffenders.length > 0) {
  process.exit(1);
}

console.log("check-db-chokepoint: OK");

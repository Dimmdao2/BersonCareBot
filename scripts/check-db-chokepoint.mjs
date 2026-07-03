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

function collectOffenders(files) {
  const poolOffenders = [];
  const connectOffenders = [];

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
  }

  return { poolOffenders, connectOffenders };
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
  `;
  const files = [virtualAbs];
  const poolOffenders = [];
  const connectOffenders = [];
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
  }
  if (poolOffenders.length === 1 && connectOffenders.length === 1) {
    console.log("check-db-chokepoint self-test: OK");
    process.exit(0);
  }
  console.error("check-db-chokepoint self-test: expected synthetic offenders were not detected");
  process.exit(1);
}

const files = scanRoots.flatMap((root) => listTsFiles(join(repoRoot, root)));
const { poolOffenders, connectOffenders } = collectOffenders(files);

printOffenders("new Pool outside named DB pool providers:", poolOffenders);
printOffenders(".connect() outside checkout helpers / documented ops KEEP:", connectOffenders);

if (poolOffenders.length > 0 || connectOffenders.length > 0) {
  process.exit(1);
}

console.log("check-db-chokepoint: OK");

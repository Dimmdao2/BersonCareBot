#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Application runtime has exactly two data-port factories. Media remains in the census so any
// reintroduced DB dependency is rejected rather than becoming a third runtime data door.
const scanRoots = ['apps/webapp/src', 'apps/integrator/src', 'apps/media-worker/src'];
const roleSwitchScanRoots = [...scanRoots, 'packages/db-principal/src'];

const allowedPoolProviderFiles = new Set([
  'apps/webapp/src/infra/db/webappPoolProvider.ts',
  'apps/integrator/src/infra/db/integratorPoolProvider.ts',
]);

// Explicitly non-runtime: migration needs its local deploy/migrator authority. Do not add regular
// services here; a new runtime pool must be one of the two factories above.
const deployOnlyPoolProviderFiles = new Set([
  'apps/integrator/src/infra/db/integratorMigrationPoolProvider.ts',
]);

const disposableOrAdminPoolProviderFiles = new Set([
  // CLI health proof only; never imported by API/worker/scheduler runtime.
  'apps/integrator/src/infra/scripts/projectionHealthPoolProvider.ts',
]);

const allowedConnectFiles = new Set([
  'apps/webapp/src/infra/db/withClient.ts',
  'apps/integrator/src/infra/db/withClient.ts',
  // Port-context Drizzle transactions acquire exactly one client and hand it immediately to the
  // shared lifecycle; this is not a second pool or a generic checkout path.
  'apps/webapp/src/app-layer/db/drizzle.ts',
  // Phase 1 DB principal chokepoint: provider-level promise pool.query wrappers
  // must checkout a client so labels can be installed and cleared around the query.
  'apps/webapp/src/infra/db/webappPoolProvider.ts',
  'apps/integrator/src/infra/db/integratorPoolProvider.ts',
  'apps/integrator/src/infra/db/integratorMigrationPoolProvider.ts',
  // D30/D20-уровень-3 (31.07): одноразовые скрипты-доказательства конкуренции. Поднимают СВОЙ
  // временный PostgreSQL в /tmp и держат по нескольку параллельных сессий — иначе гонку за замком,
  // за строкой очереди и за ключом идемпотентности доказать нечем. Тот же класс, что снятый
  // stage6-бэкфил: ops/one-off, вне рантайма приложения. Гоняются работой `d30-scheduler-concurrency`
  // в `.github/workflows/ci.yml`.
  'apps/integrator/src/infra/scripts/check-d30-scheduler-lock-concurrency.ts',
  'apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts',
  'apps/integrator/src/infra/scripts/check-d30-idempotency-key-concurrency.ts',
]);

const allowedRoleSwitchFiles = new Set([
  'packages/db-principal/src/index.ts',
  'packages/db-principal/src/portContext.ts',
  'apps/webapp/src/app-layer/db/drizzle.ts',
]);

const allowedLayerRawSqlFiles = new Set([
  // S1 residual: SQL fragments intentionally kept until dedicated cleanup/guard allowlist decision.
  'apps/webapp/src/modules/analytics/analyticsAudience.ts',
  'apps/webapp/src/modules/doctor-clients/activeMessengerBindingSql.ts',
  // App-layer Drizzle SQL metric fragments; S5 protects against growth while preserving current behavior.
  'apps/webapp/src/app-layer/health/adminReminderPipelineMetrics.ts',
  'apps/webapp/src/app-layer/health/adminWebPushHealthMetrics.ts',
  'apps/webapp/src/app-layer/media/adminPlaybackHealthMetrics.ts',
  'apps/webapp/src/app-layer/media/hlsProxyErrorEvents.ts',
  'apps/webapp/src/app-layer/media/playbackClientEvents.ts',
  'apps/webapp/src/app-layer/media/playbackHourlyRetention.ts',
  'apps/webapp/src/app-layer/media/playbackStatsHourly.ts',
  'apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts',
  'apps/webapp/src/app-layer/stats/reminderNotificationPeopleStats.ts',
]);

function hasOnlyAllowedDrizzlePrincipalSql(rel, src, rawSqlCount) {
  return (
    rel === 'apps/webapp/src/app-layer/db/drizzle.ts' &&
    rawSqlCount > 0 &&
    src.includes('applyDbPrincipalToTransaction') &&
    src.includes('clearDbPrincipalFromTransaction')
  );
}

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
      name.endsWith('.ts') &&
      !name.endsWith('.test.ts') &&
      !name.endsWith('.spec.ts') &&
      !name.endsWith('.d.ts') &&
      !name.includes('.devDb.')
    ) {
      out.push(path);
    }
  }
  return out;
}

function isCommentOrDocLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function countRuntimeMatches(src, pattern) {
  return src.split('\n').filter((line) => !isCommentOrDocLine(line) && pattern.test(line)).length;
}

function isForbiddenMediaWorkerDbModule(value) {
  return value === 'pg' || value === '@bersoncare/db-principal' || value === 'drizzle-orm' || value.startsWith('drizzle-orm/');
}

function moduleNameFromExpression(expression) {
  if (!ts.isStringLiteral(expression)) return null;
  return isForbiddenMediaWorkerDbModule(expression.text) ? expression.text : null;
}

function boundNames(name, output) {
  if (ts.isIdentifier(name)) {
    output.add(name.text);
    return;
  }
  for (const element of name.elements) boundNames(element.name, output);
}

/** Compiler-API gate: media-worker must have no importable DB door, regardless of aliases. */
function inspectMediaWorkerDbDoors(rel, src) {
  const sourceFile = ts.createSourceFile(rel, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const offenders = [];
  const bindings = new Set();
  const seen = new Set();
  const add = (detail) => {
    if (!seen.has(detail)) {
      seen.add(detail);
      offenders.push(`${rel} (${detail})`);
    }
  };
  const isDoorExpression = (node) => {
    if (ts.isIdentifier(node)) return bindings.has(node.text);
    return ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && bindings.has(node.expression.text);
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const moduleName = moduleNameFromExpression(node.moduleSpecifier);
      if (moduleName) {
        add(`forbidden import ${moduleName}`);
        if (node.importClause) {
          if (node.importClause.name) bindings.add(node.importClause.name.text);
          const named = node.importClause.namedBindings;
          if (named && ts.isNamespaceImport(named)) bindings.add(named.name.text);
          if (named && ts.isNamedImports(named)) {
            for (const element of named.elements) bindings.add(element.name.text);
          }
        }
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializer = node.initializer;
      const requireModule = ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression) && initializer.expression.text === 'require'
        ? moduleNameFromExpression(initializer.arguments[0])
        : null;
      const dynamicModule = ts.isAwaitExpression(initializer) && ts.isCallExpression(initializer.expression) && initializer.expression.expression.kind === ts.SyntaxKind.ImportKeyword
        ? moduleNameFromExpression(initializer.expression.arguments[0])
        : null;
      const propertyRequireModule = ts.isPropertyAccessExpression(initializer) && ts.isCallExpression(initializer.expression) && ts.isIdentifier(initializer.expression.expression) && initializer.expression.expression.text === 'require'
        ? moduleNameFromExpression(initializer.expression.arguments[0])
        : null;
      const moduleName = requireModule || dynamicModule || propertyRequireModule;
      if (moduleName) {
        add(`forbidden ${dynamicModule ? 'dynamic import' : 'require'} ${moduleName}`);
        boundNames(node.name, bindings);
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const moduleName = moduleNameFromExpression(node.arguments[0]);
      if (moduleName) add(`forbidden dynamic import ${moduleName}`);
    }
    if (ts.isNewExpression(node) && isDoorExpression(node.expression)) add('forbidden DB constructor');
    if (ts.isCallExpression(node) && isDoorExpression(node.expression)) add('forbidden DB call');
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return offenders;
}

function isGuardedLayerFile(rel) {
  if (rel.startsWith('apps/webapp/src/modules/')) return true;
  if (rel.startsWith('apps/webapp/src/app-layer/')) return true;
  if (!rel.startsWith('apps/webapp/src/app/')) return false;
  return rel.endsWith('/route.ts') || rel.endsWith('/page.tsx') || rel.endsWith('/actions.ts');
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
  const callbackQueryOffenders = [];
  const roleSwitchOffenders = [];
  const mediaWorkerDbDoorOffenders = [];

  for (const abs of files) {
    const rel = relative(repoRoot, abs).replace(/\\/g, '/');
    const src = readFileSync(abs, 'utf8');
    if (rel.startsWith('apps/media-worker/src/')) mediaWorkerDbDoorOffenders.push(...inspectMediaWorkerDbDoors(rel, src));
    const poolCount = countRuntimeMatches(src, /\bnew\s+(?:pg\.)?(?:Pg)?Pool\b/);
    if (
      poolCount > 0 &&
      !allowedPoolProviderFiles.has(rel) &&
      !deployOnlyPoolProviderFiles.has(rel) &&
      !disposableOrAdminPoolProviderFiles.has(rel)
    ) {
      poolOffenders.push(`${rel} (${poolCount}x new Pool)`);
    }

    const connectCount = countRuntimeMatches(src, /\.connect\(/);
    if (connectCount > 0 && !allowedConnectFiles.has(rel)) {
      connectOffenders.push(`${rel} (${connectCount}x .connect())`);
    }

    const rawSqlCount = isGuardedLayerFile(rel) ? countLayerRawSqlMatches(src) : 0;
    if (
      rawSqlCount > 0 &&
      !allowedLayerRawSqlFiles.has(rel) &&
      !hasOnlyAllowedDrizzlePrincipalSql(rel, src, rawSqlCount)
    ) {
      layerRawSqlOffenders.push(`${rel} (${rawSqlCount}x layer SQL signal)`);
    }

    const callbackQueryCount = countRuntimeMatches(src, /\.query\s*\([^;\n]*(?:function\s*\(|=>)/);
    if (callbackQueryCount > 0) {
      callbackQueryOffenders.push(`${rel} (${callbackQueryCount}x callback-form query signal)`);
    }

    const roleSwitchCount = countRuntimeMatches(src, /\b(?:SET|RESET)\s+ROLE\b/);
    if (roleSwitchCount > 0 && !allowedRoleSwitchFiles.has(rel)) {
      roleSwitchOffenders.push(`${rel} (${roleSwitchCount}x runtime role switch signal)`);
    }
  }

  return {
    poolOffenders,
    connectOffenders,
    layerRawSqlOffenders,
    callbackQueryOffenders,
    roleSwitchOffenders,
    mediaWorkerDbDoorOffenders,
  };
}

function printOffenders(label, offenders) {
  if (offenders.length === 0) return;
  console.error(`check-db-chokepoint: ${label}`);
  for (const offender of offenders) console.error(`  - ${offender}`);
}

if (process.argv.includes('--self-test')) {
  const virtualRel = 'apps/webapp/src/app/api/example/route.ts';
  const virtualAbs = join(repoRoot, virtualRel);
  const virtualMediaWorkerRel = 'apps/media-worker/src/injectedPool.ts';
  const originalReadFileSync = readFileSync;
  const syntheticConnectionString = ['postgres', '://example'].join('');
  const syntheticSource = `
    import { Pool } from "pg";
    const pool = new Pool({ connectionString: "${syntheticConnectionString}" });
    await pool.connect();
    await pool.query("SELECT 1", [], () => undefined);
    await client.query("SET ROLE app_staff");
  `;
  const files = [virtualAbs];
  const poolOffenders = [];
  const connectOffenders = [];
  const layerRawSqlOffenders = [];
  const callbackQueryOffenders = [];
  const roleSwitchOffenders = [];
  for (const abs of files) {
    const rel = relative(repoRoot, abs).replace(/\\/g, '/');
    const src = abs === virtualAbs ? syntheticSource : originalReadFileSync(abs, 'utf8');
    const poolCount = countRuntimeMatches(src, /\bnew\s+(?:pg\.)?(?:Pg)?Pool\b/);
    if (
      poolCount > 0 &&
      !allowedPoolProviderFiles.has(rel) &&
      !deployOnlyPoolProviderFiles.has(rel) &&
      !disposableOrAdminPoolProviderFiles.has(rel)
    ) {
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
    const callbackQueryCount = countRuntimeMatches(src, /\.query\s*\([^;\n]*(?:function\s*\(|=>)/);
    if (callbackQueryCount > 0) {
      callbackQueryOffenders.push(`${rel} (${callbackQueryCount}x callback-form query signal)`);
    }
    const roleSwitchCount = countRuntimeMatches(src, /\b(?:SET|RESET)\s+ROLE\b/);
    if (roleSwitchCount > 0 && !allowedRoleSwitchFiles.has(rel)) {
      roleSwitchOffenders.push(`${rel} (${roleSwitchCount}x runtime role switch signal)`);
    }
  }
  const mediaWorkerPoolInjected = countRuntimeMatches(syntheticSource, /\bnew\s+(?:pg\.)?(?:Pg)?Pool\b/) > 0 &&
    !allowedPoolProviderFiles.has(virtualMediaWorkerRel);
  const mediaDoorCases = [
    'import { Pool as DatabasePool } from "pg"; new DatabasePool();',
    'import pg from "pg"; new pg.Pool();',
    'import * as pg from "pg"; new pg.Pool();',
    'const { Pool: DatabasePool } = require("pg"); new DatabasePool();',
    'const pg = await import("pg"); new pg.Pool();',
    'import { drizzle as openDb } from "drizzle-orm/node-postgres"; openDb({});',
    'import { createSaasIsolationBackgroundReporter as report } from "@bersoncare/db-principal"; report({});',
  ];
  const mediaDoorCasesRejected = mediaDoorCases.every((source, index) =>
    inspectMediaWorkerDbDoors(`apps/media-worker/src/self-test-${index}.ts`, source).length > 0,
  );
  const canonicalHttpClientAccepted = inspectMediaWorkerDbDoors(
    'apps/media-worker/src/control.ts',
    'export async function command() { return fetch(new URL("/api/internal/media-worker/control", "http://127.0.0.1")); }',
  ).length === 0;
  if (
    poolOffenders.length === 1 &&
    connectOffenders.length === 1 &&
    layerRawSqlOffenders.length === 1 &&
    callbackQueryOffenders.length === 1 &&
    roleSwitchOffenders.length === 1 &&
    mediaWorkerPoolInjected &&
    mediaDoorCasesRejected &&
    canonicalHttpClientAccepted
  ) {
    console.log('check-db-chokepoint self-test: OK');
    process.exit(0);
  }
  console.error('check-db-chokepoint self-test: expected synthetic offenders were not detected');
  process.exit(1);
}

const files = [
  ...new Set([
    ...scanRoots.flatMap((root) => listTsFiles(join(repoRoot, root))),
    ...roleSwitchScanRoots.flatMap((root) => listTsFiles(join(repoRoot, root))),
  ]),
];
const {
  poolOffenders,
  connectOffenders,
  layerRawSqlOffenders,
  callbackQueryOffenders,
  roleSwitchOffenders,
  mediaWorkerDbDoorOffenders,
} = collectOffenders(files);

printOffenders('new Pool outside the two runtime port factories or explicit deploy-only provider:', poolOffenders);
printOffenders('.connect() outside checkout helpers / documented ops KEEP:', connectOffenders);
printOffenders('raw SQL in guarded layers outside S5 allowlist:', layerRawSqlOffenders);
printOffenders('callback-form query outside the promise DB chokepoint:', callbackQueryOffenders);
printOffenders('runtime role switching outside packages/db-principal:', roleSwitchOffenders);
printOffenders('media-worker DB dependency/import door:', mediaWorkerDbDoorOffenders);

if (
  poolOffenders.length > 0 ||
  connectOffenders.length > 0 ||
  layerRawSqlOffenders.length > 0 ||
  callbackQueryOffenders.length > 0 ||
  roleSwitchOffenders.length > 0 ||
  mediaWorkerDbDoorOffenders.length > 0
) {
  process.exit(1);
}

console.log('check-db-chokepoint: OK');

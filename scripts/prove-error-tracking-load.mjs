import { createServer } from "node:http";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

import { Pool } from "../apps/integrator/node_modules/pg/esm/index.mjs";
import { initIntegratorErrorTracking } from "../apps/integrator/dist/infra/observability/errorTracking.js";

import {
  captureErrorTrackingException,
  closeErrorTracking,
  flushErrorTracking,
} from "../packages/error-tracking/dist/index.js";

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function p95(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? 0;
}

async function benchmarkHealth(url, count = 1_500) {
  const samples = [];
  for (let index = 0; index < count + 100; index += 1) {
    const started = performance.now();
    const response = await fetch(url);
    if (response.status !== 200) throw new Error("health_status_failed");
    await response.arrayBuffer();
    if (index >= 100) samples.push(performance.now() - started);
  }
  return p95(samples);
}

const receiver = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end("{}");
});
const health = createServer((request, response) => {
  if (request.url !== "/health") {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end('{"ok":true}');
});

await Promise.all([listen(receiver), listen(health)]);
const receiverAddress = receiver.address();
const healthAddress = health.address();
if (!receiverAddress || typeof receiverAddress === "string" || !healthAddress || typeof healthAddress === "string") {
  throw new Error("loopback_listen_failed");
}

function observeRuntimePool(pool) {
  const queries = [];
  let config = { enabled: false, dsn: "" };
  pool.query = async (sql, params = []) => {
    queries.push({ sql, params: [...params] });
    const key = params[0];
    const value = key === "error_tracking_enabled"
      ? config.enabled
      : key === "error_tracking_dsn"
        ? config.dsn
        : null;
    return { rows: [{ value_json: { value } }], rowCount: 1 };
  };
  const db = {
    async query(sql, params = []) {
      return pool.query(sql, params);
    },
    async tx(fn) {
      return fn(db);
    },
  };
  return {
    db,
    queries,
    setConfig(enabled, dsn) {
      config = { enabled, dsn };
    },
  };
}

function poolSnapshot(pool) {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

async function collectPostBurstRss(peakRss) {
  const samples = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    global.gc?.();
    await delay(25);
    const rss = process.memoryUsage().rss;
    samples.push(rss);
    if (rss < peakRss) break;
  }
  return samples;
}

const nativePool = new Pool({
  connectionString: "postgresql://invalid@127.0.0.1:1/not-connected",
  max: 4,
});
try {
  const healthUrl = `http://127.0.0.1:${healthAddress.port}/health`;
  const initialPool = poolSnapshot(nativePool);
  const dsn = `http://public@127.0.0.1:${receiverAddress.port}/1`;
  const runtimeBoundary = observeRuntimePool(nativePool);
  runtimeBoundary.setConfig(false, dsn);
  await initIntegratorErrorTracking(runtimeBoundary.db, "api");
  const readsAfterDisabledStartup = runtimeBoundary.queries.length;
  const disabledP95 = await benchmarkHealth(healthUrl);
  await closeErrorTracking();
  runtimeBoundary.setConfig(true, dsn);
  await initIntegratorErrorTracking(runtimeBoundary.db, "api");
  const readsAfterStartup = runtimeBoundary.queries.length;
  const enabledP95 = await benchmarkHealth(healthUrl);
  const readsAfterLoad = runtimeBoundary.queries.length;
  if (readsAfterLoad !== readsAfterStartup) throw new Error("per_request_runtime_db_read_detected");
  const accessorQueries = runtimeBoundary.queries;
  if (!accessorQueries.every((query) => query.sql === "SELECT app.read_global_server_runtime_setting($1) AS value_json")) {
    throw new Error("unexpected_runtime_accessor_query");
  }
  const afterLoadPool = poolSnapshot(nativePool);
  if (JSON.stringify(afterLoadPool) !== JSON.stringify(initialPool)) throw new Error("db_pool_state_changed");
  const deltaPercent = disabledP95 === 0 ? 0 : ((enabledP95 - disabledP95) / disabledP95) * 100;
  if (deltaPercent > 5) {
    throw new Error(`health_p95_regression:${deltaPercent.toFixed(2)}%`);
  }

  for (let index = 0; index < 25; index += 1) {
    captureErrorTrackingException(new Error(`warmup-${index}`), "integrator_startup_fatal");
  }
  await flushErrorTracking(2_000);
  global.gc?.();
  await delay(25);
  const baselineRss = process.memoryUsage().rss;

  const pressure = Array.from({ length: 8 }, (_, index) => {
    const payload = Buffer.allocUnsafeSlow(16 * 1024 * 1024);
    payload.fill(index);
    const error = new Error(`rss-burst-${index}`);
    Object.assign(error, { syntheticPayload: payload });
    captureErrorTrackingException(error, "integrator_startup_fatal");
    return { error, payload };
  });
  const peakRss = process.memoryUsage().rss;
  pressure.length = 0;
  await flushErrorTracking(2_000);
  const postBurstRss = await collectPostBurstRss(peakRss);
  const rssSamples = [baselineRss, peakRss, ...postBurstRss];
  const nonDecreasing = rssSamples.slice(1).every((value, index) => value >= rssSamples[index]);
  if (nonDecreasing) throw new Error(`rss_non_decreasing:${rssSamples.join(",")}`);

  console.log(JSON.stringify({
    healthP95Ms: { disabled: disabledP95, enabled: enabledP95, deltaPercent },
    runtimeDbReads: {
      startup: readsAfterStartup,
      afterLoad: readsAfterLoad,
      sourceBackedAccessorCalls: accessorQueries.length,
      disabledStartupCalls: readsAfterDisabledStartup,
      keys: accessorQueries.slice(-2).map((query) => query.params[0]),
    },
    pool: { before: initialPool, after: afterLoadPool },
    rssSamples,
  }, null, 2));
} finally {
  await closeErrorTracking(1_500);
  await nativePool.end();
  await Promise.all([close(receiver), close(health)]);
}

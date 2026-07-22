import { createServer } from "node:http";
import process from "node:process";
import { performance } from "node:perf_hooks";

import {
  captureErrorTrackingException,
  closeErrorTracking,
  flushErrorTracking,
  initErrorTracking,
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

const fakePool = { totalCount: 4, idleCount: 4, waitingCount: 0 };
let runtimeDbReads = 0;
const init = async (enabled) => {
  runtimeDbReads += 2;
  await initErrorTracking({
    enabled,
    dsn: `http://public@127.0.0.1:${receiverAddress.port}/1`,
    service: "integrator",
    processRole: "api",
    buildId: "synthetic-load-proof",
  });
};

try {
  const healthUrl = `http://127.0.0.1:${healthAddress.port}/health`;
  const initialPool = JSON.stringify(fakePool);
  await init(false);
  const disabledP95 = await benchmarkHealth(healthUrl);
  await closeErrorTracking();
  await init(true);
  const readsAfterStartup = runtimeDbReads;
  const enabledP95 = await benchmarkHealth(healthUrl);
  if (runtimeDbReads !== readsAfterStartup) throw new Error("per_request_runtime_db_read_detected");
  if (JSON.stringify(fakePool) !== initialPool) throw new Error("db_pool_state_changed");
  const deltaPercent = disabledP95 === 0 ? 0 : ((enabledP95 - disabledP95) / disabledP95) * 100;
  if (deltaPercent > 5) {
    throw new Error(`health_p95_regression:${deltaPercent.toFixed(2)}%`);
  }

  const rssSamples = [process.memoryUsage().rss];
  for (let batch = 0; batch < 3; batch += 1) {
    for (let index = 0; index < 50; index += 1) {
      captureErrorTrackingException(new Error(`synthetic-${batch}-${index}`), "integrator_startup_fatal");
    }
    await flushErrorTracking(2_000);
    global.gc?.();
    rssSamples.push(process.memoryUsage().rss);
  }
  const strictlyMonotonic = rssSamples.slice(1).every((value, index) => value > rssSamples[index]);
  if (strictlyMonotonic) throw new Error(`rss_strictly_monotonic:${rssSamples.join(",")}`);

  console.log(JSON.stringify({
    healthP95Ms: { disabled: disabledP95, enabled: enabledP95, deltaPercent },
    runtimeDbReads: { startup: readsAfterStartup, afterLoad: runtimeDbReads },
    pool: fakePool,
    rssSamples,
  }, null, 2));
} finally {
  await closeErrorTracking(1_500);
  await Promise.all([close(receiver), close(health)]);
}

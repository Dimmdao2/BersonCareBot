import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeErrorTracking,
  flushErrorTracking,
  initErrorTracking,
} from "@bersoncare/error-tracking";

import {
  captureMediaWorkerLoopError,
  captureMediaWorkerStartupFatal,
} from "./errorTracking.js";

let server: Server;
let dsn: string;
let bodies: string[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => { body += chunk; });
    request.on("end", () => {
      bodies.push(body);
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("loopback_listen_failed");
  dsn = `http://public@127.0.0.1:${address.port}/1`;
});

afterAll(async () => {
  await closeErrorTracking(1_000);
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function verifyHook(capturePoint: string, invoke: (error: Error) => void): Promise<void> {
  const marker = ["PII", "MARKER", "123456789"].join("_");
  bodies = [];
  await closeErrorTracking(1_000);
  await initErrorTracking({
    enabled: true,
    dsn,
    service: "media-worker",
    processRole: "media-worker",
    buildId: "process-hook-test",
  });
  await flushErrorTracking(1_000);
  expect(bodies).toHaveLength(0);
  invoke(new Error(marker));
  await flushErrorTracking(1_000);
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).not.toContain(marker);
  expect(bodies[0]).toContain(capturePoint);
  expect(bodies[0]).toContain('"process_role":"media-worker"');
}

describe("media-worker error hooks", () => {
  it("sends zero success events and one sanitized loop error", async () => {
    await verifyHook("media_worker_loop_error", captureMediaWorkerLoopError);
  });

  it("sends zero success events and one sanitized early startup fatal", async () => {
    await verifyHook("media_worker_startup_fatal", captureMediaWorkerStartupFatal);
  });
});

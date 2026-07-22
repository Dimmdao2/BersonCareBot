import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeErrorTracking,
  flushErrorTracking,
  initErrorTracking,
} from "@bersoncare/error-tracking";

import { captureWebappRequestError } from "./errorTracking";

let server: Server;
let dsn: string;
const bodies: string[] = [];

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

describe("webapp request error hook", () => {
  it("sends zero success events and one sanitized request error", async () => {
    const marker = ["PII", "MARKER", "123456789"].join("_");
    await initErrorTracking({
      enabled: true,
      dsn,
      service: "webapp",
      processRole: "webapp",
      buildId: "process-hook-test",
    });
    await flushErrorTracking(1_000);
    expect(bodies).toHaveLength(0);
    captureWebappRequestError(new Error(marker));
    await flushErrorTracking(1_000);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toContain(marker);
    expect(bodies[0]).toContain("webapp_request_error");
    expect(bodies[0]).toContain('"process_role":"webapp"');
  });
});

import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import {
  captureErrorTrackingException,
  closeErrorTracking,
  flushErrorTracking,
  initErrorTracking,
} from "./runtime.js";

describe("loopback Sentry receiver", () => {
  afterEach(async () => {
    await closeErrorTracking(1_000);
  });

  it("sends zero success events and one sanitized error envelope", async () => {
    const bodies: string[] = [];
    const server = createServer((request, response) => {
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

    try {
      await initErrorTracking({
        enabled: true,
        dsn: `http://public@127.0.0.1:${address.port}/1`,
        service: "integrator",
        processRole: "api",
        buildId: "loopback-test",
      });
      await flushErrorTracking(1_000);
      expect(bodies).toHaveLength(0);

      captureErrorTrackingException(new Error("pii-marker@example.test"), "integrator_startup_fatal");
      await flushErrorTracking(1_000);
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).not.toContain("pii-marker@example.test");
      expect(bodies[0]).toContain("[REDACTED]");
      expect(bodies[0]).toContain("integrator_startup_fatal");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

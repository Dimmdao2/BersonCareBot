/**
 * E2E: health API. Requires webapp to be built and server running, or use in-process handler.
 * Run with: pnpm --dir webapp test:e2e
 * Optional: set WEBAPP_E2E_BASE_URL to hit a running server (e.g. http://127.0.0.1:5200).
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";

const BASE = process.env.WEBAPP_E2E_BASE_URL ?? "";

describe("api/health e2e", () => {
  const skip = !BASE;

  beforeAll(() => {
    if (skip) {
      console.warn("WEBAPP_E2E_BASE_URL not set, skipping e2e that require running server");
    }
  });

  it.skipIf(skip)("GET /api/health returns ok and db", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; db: string };
    expect(data.ok).toBe(true);
    expect(["up", "down"]).toContain(data.db);
  });
});

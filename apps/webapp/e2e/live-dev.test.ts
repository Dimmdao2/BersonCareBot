/**
 * E2E against live dev server: run when dev is up and E2E_LIVE_DEV=1.
 * Usage: start `pnpm webapp:dev`, then `pnpm test:e2e:live`.
 */
import { describe, expect, it } from "vitest";

const BASE = process.env.E2E_LIVE_BASE ?? "http://127.0.0.1:5200";

describe("live dev server e2e", () => {
  it.skipIf(!process.env.E2E_LIVE_DEV)(
    "GET /api/health returns 200 when dev server is running",
    async () => {
      const res = await fetch(`${BASE}/api/health`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { ok?: boolean };
      expect(data.ok).toBe(true);
    }
  );

  it.skipIf(!process.env.E2E_LIVE_DEV)(
    "GET /app/doctor redirects or returns when dev server is running",
    async () => {
      const res = await fetch(`${BASE}/app/doctor`, { redirect: "manual" });
      expect([200, 302, 307]).toContain(res.status);
    }
  );
});

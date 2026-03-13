/**
 * E2E: invoke API route handlers in-process (no server). No Next.js request context.
 */
import { describe, expect, it } from "vitest";

describe("API routes in-process", () => {
  it("GET /api/health handler returns ok and db", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; db: string };
    expect(data.ok).toBe(true);
    expect(["up", "down"]).toContain(data.db);
  });
});

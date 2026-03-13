/**
 * E2E: auth exchange API. Requires WEBAPP_E2E_BASE_URL when running against real server.
 */
import { describe, expect, it } from "vitest";

const BASE = process.env.WEBAPP_E2E_BASE_URL ?? "";

describe("api/auth/exchange e2e", () => {
  const skip = !BASE;

  it.skipIf(skip)("POST with dev:client returns 200 and redirectTo", async () => {
    const res = await fetch(`${BASE}/api/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "dev:client" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; redirectTo?: string };
    expect(data.ok).toBe(true);
    expect(data.redirectTo).toBe("/app/patient");
  });

  it.skipIf(skip)("POST without token returns 400", async () => {
    const res = await fetch(`${BASE}/api/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

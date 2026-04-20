import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("GET /api/version", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns BUILD_ID from env with no-store cache headers", async () => {
    vi.stubEnv("BUILD_ID", "deploy-123");
    const { GET } = await import("./route");
    const response = await GET();
    const payload = (await response.json()) as { buildId?: string; startedAt?: number };

    expect(payload.buildId).toBe("deploy-123");
    expect(typeof payload.startedAt).toBe("number");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("falls back to NEXT_PUBLIC_BUILD_ID when BUILD_ID missing", async () => {
    vi.stubEnv("BUILD_ID", "");
    vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "public-456");
    const { GET } = await import("./route");
    const response = await GET();
    const payload = (await response.json()) as { buildId?: string };

    expect(payload.buildId).toBe("public-456");
  });

  it("does not import app-layer/modules/db dependencies", () => {
    const routePath = resolve(process.cwd(), "src/app/api/version/route.ts");
    const source = readFileSync(routePath, "utf8");
    expect(source).not.toMatch(/from\s+["']@\/app-layer\//);
    expect(source).not.toMatch(/from\s+["']@\/modules\//);
    expect(source).not.toMatch(/from\s+["']@\/db\//);
  });
});

/**
 * E2E (in-process): CMS media upload route.
 * RSC motivation page — в smoke-app-router-rsc-pages-inprocess.
 */
import { describe, expect, it } from "vitest";

describe("cms e2e (in-process)", () => {
  it("POST /api/media/upload handler is exported", async () => {
    const mod = await import("@/app/api/media/upload/route");
    expect(typeof mod.POST).toBe("function");
  });
});

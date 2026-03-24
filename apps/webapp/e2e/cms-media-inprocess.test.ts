/**
 * E2E (in-process): CMS media upload route и новости главной.
 */
import { describe, expect, it } from "vitest";

describe("cms e2e (in-process)", () => {
  it("POST /api/media/upload handler is exported", async () => {
    const mod = await import("@/app/api/media/upload/route");
    expect(typeof mod.POST).toBe("function");
  });

  it("doctor content news page loads", async () => {
    const mod = await import("@/app/app/doctor/content/news/page");
    expect(typeof mod.default).toBe("function");
  });
});

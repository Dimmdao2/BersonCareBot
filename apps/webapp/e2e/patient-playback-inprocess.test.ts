/**
 * Smoke: patient content playback stack (phase-05) — in-process imports, no live browser.
 */
import { describe, expect, it } from "vitest";

describe("patient playback (phase-05, in-process)", () => {
  it("exports GET /api/media/[id]/playback", async () => {
    const mod = await import("@/app/api/media/[id]/playback/route");
    expect(typeof mod.GET).toBe("function");
  });

  it("resolveMediaPlaybackPayload is available from app-layer", async () => {
    const mod = await import("@/app-layer/media/resolveMediaPlaybackPayload");
    expect(typeof mod.resolveMediaPlaybackPayload).toBe("function");
  });

  it("PatientContentAdaptiveVideo client component exists", async () => {
    const mod = await import("@/app/app/patient/content/[slug]/PatientContentAdaptiveVideo");
    expect(typeof mod.PatientContentAdaptiveVideo).toBe("function");
  });

  it("patient content slug page server component exists", async () => {
    const mod = await import("@/app/app/patient/content/[slug]/page");
    expect(typeof mod.default).toBe("function");
  });
});

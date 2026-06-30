import { describe, it, expect } from "vitest";
import { computeMediaPreviewStatus } from "./collectAdminSystemHealthData";

/** Build a full MediaPreviewCounters with all-zero defaults + overrides per mime. */
function counters(overrides: Partial<Record<string, Partial<Record<string, number>>>> = {}) {
  const mk = (o: Partial<Record<string, number>> = {}) => ({
    pending: 0,
    ready: 0,
    failed: 0,
    skipped: 0,
    ...o,
  });
  return {
    "video/quicktime": mk(overrides["video/quicktime"]),
    "image/heic": mk(overrides["image/heic"]),
    "image/heif": mk(overrides["image/heif"]),
  } as Parameters<typeof computeMediaPreviewStatus>[0];
}

describe("computeMediaPreviewStatus (#53 — no false degraded on normal queue)", () => {
  it("all zero → ok", () => {
    expect(computeMediaPreviewStatus(counters(), 0)).toBe("ok");
  });

  it("merely PENDING (not stale) → ok (was falsely degraded)", () => {
    expect(computeMediaPreviewStatus(counters({ "image/heic": { pending: 5 } }), 0)).toBe("ok");
  });

  it("SKIPPED (intentional) → ok (was falsely degraded)", () => {
    expect(computeMediaPreviewStatus(counters({ "image/heif": { skipped: 3 } }), 0)).toBe("ok");
  });

  it("STALE pending (stuck > threshold) → degraded", () => {
    expect(computeMediaPreviewStatus(counters({ "image/heic": { pending: 2 } }), 2)).toBe("degraded");
  });

  it("FAILED preview → error", () => {
    expect(computeMediaPreviewStatus(counters({ "video/quicktime": { failed: 1 } }), 0)).toBe("error");
  });

  it("failed wins over stale-pending → error", () => {
    expect(
      computeMediaPreviewStatus(counters({ "image/heic": { failed: 1, pending: 9 } }), 9),
    ).toBe("error");
  });
});

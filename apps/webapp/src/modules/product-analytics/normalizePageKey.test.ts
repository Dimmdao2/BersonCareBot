import { describe, expect, it } from "vitest";

import { normalizePageKey } from "@/modules/product-analytics/normalizePageKey";

describe("normalizePageKey", () => {
  it("returns null outside patient app", () => {
    expect(normalizePageKey("/app/doctor/clients")).toBeNull();
    expect(normalizePageKey("/login")).toBeNull();
  });

  it("strips query string", () => {
    expect(normalizePageKey("/app/patient/home?nav=diary")).toBe("/app/patient/home");
  });

  it("groups treatment program instances", () => {
    expect(normalizePageKey("/app/patient/treatment/550e8400-e29b-41d4-a716-446655440000")).toBe(
      "/app/patient/treatment/program",
    );
    expect(normalizePageKey("/app/patient/treatment/promo/item/550e8400-e29b-41d4-a716-446655440000")).toBe(
      "/app/patient/treatment/program",
    );
  });

  it("groups CMS content and warmup slugs", () => {
    expect(normalizePageKey("/app/patient/content/warmup-intro")).toBe("/app/patient/content/page");
    expect(normalizePageKey("/app/patient/content/neck-warmup", { isWarmupContent: true })).toBe(
      "/app/patient/warmup",
    );
    expect(normalizePageKey("/app/patient/go/daily-warmup")).toBe("/app/patient/warmup");
  });

  it("keeps static patient paths", () => {
    expect(normalizePageKey("/app/patient/home")).toBe("/app/patient/home");
    expect(normalizePageKey("/app/patient/diary")).toBe("/app/patient/diary");
  });
});

import { describe, expect, it } from "vitest";

import {
  groupProductAnalyticsPageKey,
  labelProductAnalyticsPageKey,
  patientContentSlugFromPath,
} from "@/modules/product-analytics/productAnalyticsPageKey";

describe("groupProductAnalyticsPageKey", () => {
  it("merges treatment routes into one program page", () => {
    expect(groupProductAnalyticsPageKey("/app/patient/treatment/:id")).toBe(
      "/app/patient/treatment/program",
    );
    expect(groupProductAnalyticsPageKey("/app/patient/treatment/promo")).toBe(
      "/app/patient/treatment/program",
    );
    expect(groupProductAnalyticsPageKey("/app/patient/treatment/:id/item/:id")).toBe(
      "/app/patient/treatment/program",
    );
    expect(groupProductAnalyticsPageKey("/app/patient/go/plan-start-lesson")).toBe(
      "/app/patient/treatment/program",
    );
  });

  it("groups warmup entry points", () => {
    expect(groupProductAnalyticsPageKey("/app/patient/go/daily-warmup")).toBe("/app/patient/warmup");
    expect(groupProductAnalyticsPageKey("/app/patient/warmup")).toBe("/app/patient/warmup");
  });

  it("collapses CMS content paths", () => {
    expect(groupProductAnalyticsPageKey("/app/patient/content/:slug")).toBe(
      "/app/patient/content/page",
    );
  });
});

describe("labelProductAnalyticsPageKey", () => {
  it("returns Russian labels for grouped keys", () => {
    expect(labelProductAnalyticsPageKey("/app/patient/treatment/program")).toBe(
      "Программа реабилитации",
    );
    expect(labelProductAnalyticsPageKey("/app/patient/warmup")).toBe("Страница разминки");
    expect(labelProductAnalyticsPageKey("/app/patient/home")).toBe("Главная");
  });
});

describe("patientContentSlugFromPath", () => {
  it("extracts slug from content URL", () => {
    expect(patientContentSlugFromPath("/app/patient/content/neck-warmup?x=1")).toBe("neck-warmup");
    expect(patientContentSlugFromPath("/app/patient/treatment/promo")).toBeNull();
  });
});

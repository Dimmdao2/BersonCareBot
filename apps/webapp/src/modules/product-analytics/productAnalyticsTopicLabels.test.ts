import { describe, expect, it } from "vitest";

import { labelProductAnalyticsTopicCode } from "@/modules/product-analytics/productAnalyticsTopicLabels";

describe("labelProductAnalyticsTopicCode", () => {
  it("maps default notification topic ids", () => {
    expect(labelProductAnalyticsTopicCode("exercise_reminders")).toBe("Напоминания об упражнениях");
    expect(labelProductAnalyticsTopicCode("news")).toBe("Новости и обновления");
  });

  it("maps legacy warmup topic code", () => {
    expect(labelProductAnalyticsTopicCode("warmup_reminder")).toBe("Разминка (тема напоминания)");
  });
});

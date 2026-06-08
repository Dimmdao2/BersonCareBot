import { describe, expect, it } from "vitest";

import { labelProductAnalyticsTopicCode } from "@/modules/product-analytics/productAnalyticsTopicLabels";

describe("labelProductAnalyticsTopicCode", () => {
  it("maps default notification topic ids", () => {
    expect(labelProductAnalyticsTopicCode("warmup_reminders")).toBe("Напоминания о разминках");
    expect(labelProductAnalyticsTopicCode("patient_news")).toBe("Новости и уведомления");
  });

  it("maps legacy warmup topic code", () => {
    expect(labelProductAnalyticsTopicCode("warmup_reminder")).toBe("Разминка (тема напоминания)");
  });
});

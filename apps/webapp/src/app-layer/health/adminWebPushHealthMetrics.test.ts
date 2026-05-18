import { describe, expect, it } from "vitest";
import { classifyWebPushSystemHealthStatus, emptyWebPushHealthPayload } from "./adminWebPushHealthMetrics";

describe("classifyWebPushSystemHealthStatus", () => {
  it("returns not_configured when VAPID is missing", () => {
    expect(classifyWebPushSystemHealthStatus({ vapidConfigured: false, activeSubscriptionsCount: 10 })).toBe(
      "not_configured",
    );
  });

  it("returns no_data when VAPID is set but there are no subscriptions", () => {
    expect(classifyWebPushSystemHealthStatus({ vapidConfigured: true, activeSubscriptionsCount: 0 })).toBe("no_data");
  });

  it("returns ok when VAPID and subscriptions exist", () => {
    expect(classifyWebPushSystemHealthStatus({ vapidConfigured: true, activeSubscriptionsCount: 3 })).toBe("ok");
  });
});

describe("emptyWebPushHealthPayload deliveryMetricsInDb", () => {
  it("points operators to notification_delivery_attempts card", () => {
    expect(emptyWebPushHealthPayload().deliveryMetricsInDb).toBe(true);
  });
});

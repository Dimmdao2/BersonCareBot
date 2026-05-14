import { describe, expect, it } from "vitest";
import {
  retryDelaySecondsAfterFailure,
  truncateDeliveryErrorMessage,
  isOutgoingDeliveryDispatchErrorRetryable,
} from "./deliveryContract.js";

describe("deliveryContract", () => {
  it("dispatch retry policy: configuration errors are permanent", () => {
    expect(isOutgoingDeliveryDispatchErrorRetryable("CHANNEL_NOT_SPECIFIED")).toBe(false);
    expect(isOutgoingDeliveryDispatchErrorRetryable("CHANNEL_NOT_SUPPORTED:max")).toBe(false);
    expect(isOutgoingDeliveryDispatchErrorRetryable("BAD_PAYLOAD")).toBe(false);
    expect(isOutgoingDeliveryDispatchErrorRetryable("MISSING_REMINDER_FIELDS")).toBe(false);
    expect(isOutgoingDeliveryDispatchErrorRetryable("network reset")).toBe(true);
  });

  it("retryDelaySecondsAfterFailure follows 1m→5m→15m→1h schedule", () => {
    expect(retryDelaySecondsAfterFailure(1)).toBe(60);
    expect(retryDelaySecondsAfterFailure(2)).toBe(300);
    expect(retryDelaySecondsAfterFailure(3)).toBe(900);
    expect(retryDelaySecondsAfterFailure(4)).toBe(3600);
    expect(retryDelaySecondsAfterFailure(99)).toBe(3600);
  });

  it("truncateDeliveryErrorMessage caps length", () => {
    const long = "x".repeat(1000);
    expect(truncateDeliveryErrorMessage(long, 10).length).toBe(10);
  });
});

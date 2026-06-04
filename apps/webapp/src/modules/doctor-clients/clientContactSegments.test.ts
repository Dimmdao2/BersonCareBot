import { describe, expect, it } from "vitest";
import {
  accumulateClientContactBreakdown,
  classifyClientContact,
  emptyClientContactBreakdown,
} from "./clientContactSegments";

describe("clientContactSegments", () => {
  it("classifies pie and plaque buckets exclusively", () => {
    expect(
      classifyClientContact({
        hasTelegram: true,
        hasMax: false,
        hasVerifiedEmail: false,
        hasPhone: false,
      }),
    ).toBe("telegram_only");
    expect(
      classifyClientContact({
        hasTelegram: true,
        hasMax: false,
        hasVerifiedEmail: true,
        hasPhone: true,
      }),
    ).toBe("telegram_email");
    expect(
      classifyClientContact({
        hasTelegram: false,
        hasMax: false,
        hasVerifiedEmail: false,
        hasPhone: true,
      }),
    ).toBe("phone_only");
    expect(
      classifyClientContact({
        hasTelegram: false,
        hasMax: false,
        hasVerifiedEmail: false,
        hasPhone: false,
      }),
    ).toBe("app_guest");
  });

  it("accumulates breakdown totals", () => {
    const b = emptyClientContactBreakdown();
    accumulateClientContactBreakdown(b, {
      hasTelegram: true,
      hasMax: false,
      hasVerifiedEmail: false,
      hasPhone: false,
    });
    accumulateClientContactBreakdown(b, {
      hasTelegram: false,
      hasMax: false,
      hasVerifiedEmail: false,
      hasPhone: true,
    });
    expect(b.total).toBe(2);
    expect(b.pie.telegram_only).toBe(1);
    expect(b.phoneOnly).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  resolveWebPushUiStatus,
  shouldShowPushOnboardingPrompt,
} from "@/shared/lib/webPush/pushOnboardingEligibility";

describe("resolveWebPushUiStatus", () => {
  it("marks browser-only as needs_pwa when push is supported", () => {
    expect(
      resolveWebPushUiStatus({
        pushSupported: true,
        standalone: false,
        permission: "default",
        hasSubscription: false,
        vapidConfigured: true,
      }),
    ).toBe("needs_pwa");
  });

  it("marks granted without subscription as restore candidate", () => {
    expect(
      resolveWebPushUiStatus({
        pushSupported: true,
        standalone: true,
        permission: "granted",
        hasSubscription: false,
        vapidConfigured: true,
      }),
    ).toBe("granted_no_subscription");
  });

  it("marks enabled when subscription exists", () => {
    expect(
      resolveWebPushUiStatus({
        pushSupported: true,
        standalone: true,
        permission: "granted",
        hasSubscription: true,
        vapidConfigured: true,
      }),
    ).toBe("enabled");
  });
});

describe("shouldShowPushOnboardingPrompt", () => {
  const base = {
    standalone: true,
    pushSupported: true,
    permission: "default" as const,
    hasLocalSubscription: false,
    hasServerSubscription: false,
    promptDismissedAt: null,
    dismissedCooldownDays: 14,
    vapidConfigured: true,
    now: new Date("2026-05-18T12:00:00.000Z"),
  };

  it("shows when all gates pass", () => {
    expect(shouldShowPushOnboardingPrompt(base)).toBe(true);
  });

  it("hides in browser tab", () => {
    expect(shouldShowPushOnboardingPrompt({ ...base, standalone: false })).toBe(false);
  });

  it("hides when dismissed recently", () => {
    expect(
      shouldShowPushOnboardingPrompt({
        ...base,
        promptDismissedAt: "2026-05-10T12:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("shows again after cooldown", () => {
    expect(
      shouldShowPushOnboardingPrompt({
        ...base,
        promptDismissedAt: "2026-04-01T12:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("hides when subscription exists", () => {
    expect(shouldShowPushOnboardingPrompt({ ...base, hasServerSubscription: true })).toBe(false);
  });
});

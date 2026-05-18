import { describe, expect, it } from "vitest";
import {
  resolveWebPushUiStatus,
  shouldShowPushOnboardingPrompt,
} from "@/shared/lib/webPush/pushOnboardingEligibility";

describe("resolveWebPushUiStatus", () => {
  it("marks browser tab on phone as needs_pwa before push probe", () => {
    expect(
      resolveWebPushUiStatus({
        pushSupported: false,
        pushNeedsPwaInstall: true,
        standalone: false,
        permission: "default",
        hasServerSubscription: false,
        vapidConfigured: true,
      }),
    ).toBe("needs_pwa");
  });

  it("marks browser-only as needs_pwa when push is supported but not standalone", () => {
    expect(
      resolveWebPushUiStatus({
        pushSupported: true,
        pushNeedsPwaInstall: false,
        standalone: false,
        permission: "default",
        hasServerSubscription: false,
        vapidConfigured: true,
      }),
    ).toBe("needs_pwa");
  });

  it("marks granted without server subscription as restore candidate", () => {
    expect(
      resolveWebPushUiStatus({
        pushSupported: true,
        pushNeedsPwaInstall: false,
        standalone: true,
        permission: "granted",
        hasServerSubscription: false,
        vapidConfigured: true,
      }),
    ).toBe("granted_no_subscription");
  });

  it("marks enabled when server subscription exists", () => {
    expect(
      resolveWebPushUiStatus({
        pushSupported: true,
        pushNeedsPwaInstall: false,
        standalone: true,
        permission: "granted",
        hasServerSubscription: true,
        vapidConfigured: true,
      }),
    ).toBe("enabled");
  });

  it("marks denied in standalone PWA", () => {
    expect(
      resolveWebPushUiStatus({
        pushSupported: true,
        pushNeedsPwaInstall: false,
        standalone: true,
        permission: "denied",
        hasServerSubscription: false,
        vapidConfigured: true,
      }),
    ).toBe("denied_system");
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

  it("hides when server subscription exists", () => {
    expect(shouldShowPushOnboardingPrompt({ ...base, hasServerSubscription: true })).toBe(false);
  });

  it("hides when permission denied", () => {
    expect(shouldShowPushOnboardingPrompt({ ...base, permission: "denied" })).toBe(false);
  });
});

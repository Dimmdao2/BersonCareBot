import { describe, expect, it, vi } from "vitest";
import {
  ensureWarmupsReminderOnFirstPwaPush,
  isPwaPushPlatform,
} from "./ensureWarmupsReminderOnFirstPwaPush";
import { DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS } from "./scheduleSlots";

describe("isPwaPushPlatform", () => {
  it("accepts pwa variants only", () => {
    expect(isPwaPushPlatform("pwa")).toBe(true);
    expect(isPwaPushPlatform("ios-pwa")).toBe(true);
    expect(isPwaPushPlatform("android-pwa")).toBe(true);
    expect(isPwaPushPlatform("browser")).toBe(false);
    expect(isPwaPushPlatform(undefined)).toBe(false);
  });
});

describe("ensureWarmupsReminderOnFirstPwaPush", () => {
  const warmSection = {
    isVisible: true,
    requiresAuth: false,
  };

  it("creates warmups slots_v1 rule on first PWA push when none exists", async () => {
    const createObjectReminder = vi.fn().mockResolvedValue({
      ok: true,
      data: { id: "rule-1" },
    });
    const result = await ensureWarmupsReminderOnFirstPwaPush({
      userId: "u1",
      platform: "ios-pwa",
      hadExistingPushSubscription: false,
      deps: {
        reminders: { createObjectReminder, listRulesByUser: async () => [] },
        contentSections: {
          getBySlug: async (slug) => (slug === "warmups" ? warmSection : null),
          getRedirectNewSlugForOldSlug: async () => null,
        },
      },
    });

    expect(result).toEqual({ created: true, ruleId: "rule-1" });
    expect(createObjectReminder).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        linkedObjectType: "content_section",
        linkedObjectId: "warmups",
        scheduleType: "slots_v1",
        scheduleData: DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS,
        enabled: true,
      }),
    );
  });

  it("skips when push was already registered before", async () => {
    const createObjectReminder = vi.fn();
    const result = await ensureWarmupsReminderOnFirstPwaPush({
      userId: "u1",
      platform: "pwa",
      hadExistingPushSubscription: true,
      deps: {
        reminders: { createObjectReminder, listRulesByUser: async () => [] },
        contentSections: {
          getBySlug: async () => warmSection,
          getRedirectNewSlugForOldSlug: async () => null,
        },
      },
    });
    expect(result).toEqual({ created: false, reason: "not_first_push" });
    expect(createObjectReminder).not.toHaveBeenCalled();
  });

  it("skips browser platform", async () => {
    const createObjectReminder = vi.fn();
    const result = await ensureWarmupsReminderOnFirstPwaPush({
      userId: "u1",
      platform: "browser",
      hadExistingPushSubscription: false,
      deps: {
        reminders: { createObjectReminder, listRulesByUser: async () => [] },
        contentSections: {
          getBySlug: async () => warmSection,
          getRedirectNewSlugForOldSlug: async () => null,
        },
      },
    });
    expect(result).toEqual({ created: false, reason: "not_pwa" });
    expect(createObjectReminder).not.toHaveBeenCalled();
  });

  it("skips when warmups reminder already exists", async () => {
    const createObjectReminder = vi.fn();
    const result = await ensureWarmupsReminderOnFirstPwaPush({
      userId: "u1",
      platform: "android-pwa",
      hadExistingPushSubscription: false,
      deps: {
        reminders: {
          createObjectReminder,
          listRulesByUser: async () => [
            {
              id: "existing",
              linkedObjectType: "content_section",
              linkedObjectId: "warmups",
            },
          ],
        },
        contentSections: {
          getBySlug: async () => warmSection,
          getRedirectNewSlugForOldSlug: async () => null,
        },
      },
    });
    expect(result).toEqual({ created: false, reason: "already_exists" });
    expect(createObjectReminder).not.toHaveBeenCalled();
  });
});

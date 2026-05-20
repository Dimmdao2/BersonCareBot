import {
  resolvePatientContentSectionSlug,
  type PatientContentSectionSlugResolverDeps,
} from "@/modules/content-sections/resolvePatientContentSectionSlug";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import { DEFAULT_REMINDER_FORM_DAYS_MASK } from "./reminderFormDefaults";
import {
  DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS,
  SLOTS_V1_DB_PLACEHOLDER,
} from "./scheduleSlots";
import type { createRemindersService } from "./service";
import { isWarmupsContentSectionReminderRule } from "./warmupsReminderRuleMatch";

export type PwaPushPlatform = "pwa" | "ios-pwa" | "android-pwa";

export function isPwaPushPlatform(platform: string | undefined | null): platform is PwaPushPlatform {
  return platform === "pwa" || platform === "ios-pwa" || platform === "android-pwa";
}

type RemindersService = ReturnType<typeof createRemindersService>;

export type EnsureWarmupsReminderOnFirstPwaPushDeps = {
  reminders: Pick<RemindersService, "createObjectReminder" | "listRulesByUser">;
  contentSections: PatientContentSectionSlugResolverDeps;
};

export type EnsureWarmupsReminderOnFirstPwaPushResult =
  | { created: true; ruleId: string }
  | { created: false; reason: "not_pwa" | "not_first_push" | "warmups_unavailable" | "already_exists" | "create_failed" };

/**
 * После первой регистрации push в PWA создаёт правило напоминаний на раздел «Разминки»,
 * если у пользователя ещё нет такого правила. Существующие правила не перезаписываются.
 */
export async function ensureWarmupsReminderOnFirstPwaPush(params: {
  userId: string;
  platform: string | undefined | null;
  hadExistingPushSubscription: boolean;
  deps: EnsureWarmupsReminderOnFirstPwaPushDeps;
}): Promise<EnsureWarmupsReminderOnFirstPwaPushResult> {
  if (!isPwaPushPlatform(params.platform)) {
    return { created: false, reason: "not_pwa" };
  }
  if (params.hadExistingPushSubscription) {
    return { created: false, reason: "not_first_push" };
  }

  const warmRes = await resolvePatientContentSectionSlug(params.deps.contentSections, DEFAULT_WARMUPS_SECTION_SLUG);
  if (!warmRes?.section.isVisible) {
    return { created: false, reason: "warmups_unavailable" };
  }

  const warmupsSectionSlug = warmRes.canonicalSlug.trim();
  const rules = await params.deps.reminders.listRulesByUser(params.userId);
  const hasWarmupRule = rules.some((rule) => isWarmupsContentSectionReminderRule(rule, warmupsSectionSlug));
  if (hasWarmupRule) {
    return { created: false, reason: "already_exists" };
  }

  const createRes = await params.deps.reminders.createObjectReminder(params.userId, {
    linkedObjectType: "content_section",
    linkedObjectId: warmupsSectionSlug,
    schedule: {
      intervalMinutes: SLOTS_V1_DB_PLACEHOLDER.intervalMinutes,
      windowStartMinute: SLOTS_V1_DB_PLACEHOLDER.windowStartMinute,
      windowEndMinute: SLOTS_V1_DB_PLACEHOLDER.windowEndMinute,
      daysMask: DEFAULT_REMINDER_FORM_DAYS_MASK,
    },
    enabled: true,
    scheduleType: "slots_v1",
    scheduleData: DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS,
  });

  if (!createRes.ok) {
    return { created: false, reason: "create_failed" };
  }

  return { created: true, ruleId: createRes.data.id };
}

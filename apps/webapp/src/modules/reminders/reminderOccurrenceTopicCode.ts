/**
 * Same semantics as `apps/integrator/src/kernel/domain/reminders/reminderNotificationTopicCode.ts`.
 * Keep implementations in sync; change both when product rules evolve.
 * Parity regressions: `reminderOccurrenceTopicCode.parity.test.ts`.
 */

import {
  NOTIFICATION_TOPIC_TRAINING,
  NOTIFICATION_TOPIC_WARMUP,
} from "@/modules/patient-notifications/notificationTopicCodes";

export type ReminderRuleForTopicCode = {
  category?: string;
  notificationTopicCode?: string | null;
  reminderIntent?: string | null;
  linkedObjectType?: string | null;
};

function trainingTopicFromRule(rule: ReminderRuleForTopicCode): string {
  const intent =
    typeof rule.reminderIntent === "string" ? rule.reminderIntent.trim().toLowerCase() : "";
  if (intent === "warmup") return NOTIFICATION_TOPIC_WARMUP;
  return NOTIFICATION_TOPIC_TRAINING;
}

/** @see integrator reminderOccurrenceTopicCode */
export function reminderOccurrenceTopicCode(
  rule: ReminderRuleForTopicCode | undefined,
  occCategory: string,
): string | undefined {
  const explicit =
    typeof rule?.notificationTopicCode === "string" ? rule.notificationTopicCode.trim() : "";
  if (explicit.length > 0) return explicit;

  if (rule?.category === "water") {
    return undefined;
  }

  if (rule) {
    const intent =
      typeof rule.reminderIntent === "string" ? rule.reminderIntent.trim().toLowerCase() : "";
    if (intent === "warmup") return NOTIFICATION_TOPIC_WARMUP;
    if (intent === "exercises" || intent === "stretch" || intent === "generic") {
      return NOTIFICATION_TOPIC_TRAINING;
    }
    const lot =
      typeof rule.linkedObjectType === "string" ? rule.linkedObjectType.trim() : "";
    if (
      lot === "rehab_program" ||
      lot === "treatment_program_item" ||
      lot === "lfk_complex" ||
      lot === "content_page" ||
      lot === "content_section"
    ) {
      return trainingTopicFromRule(rule);
    }
  }
  const cat = occCategory.trim();
  switch (cat) {
    case "warmup":
      return NOTIFICATION_TOPIC_WARMUP;
    case "exercise":
    case "breathing":
      return NOTIFICATION_TOPIC_TRAINING;
    default:
      return undefined;
  }
}

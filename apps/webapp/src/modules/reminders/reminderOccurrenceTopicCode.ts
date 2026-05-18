/**
 * Same semantics as `apps/integrator/src/kernel/domain/reminders/reminderNotificationTopicCode.ts`.
 * Keep implementations in sync; change both when product rules evolve.
 */

const EXERCISE_TOPIC = "exercise_reminders";

export type ReminderRuleForTopicCode = {
  category?: string;
  notificationTopicCode?: string | null;
  reminderIntent?: string | null;
  linkedObjectType?: string | null;
};

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
    if (
      intent === "warmup" ||
      intent === "exercises" ||
      intent === "stretch" ||
      intent === "generic"
    ) {
      return EXERCISE_TOPIC;
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
      return EXERCISE_TOPIC;
    }
  }
  const cat = occCategory.trim();
  switch (cat) {
    case "exercise":
    case "warmup":
    case "breathing":
      return EXERCISE_TOPIC;
    default:
      return undefined;
  }
}

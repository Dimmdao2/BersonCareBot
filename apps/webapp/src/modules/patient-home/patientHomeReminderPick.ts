export {
  pickNextHomeReminder,
  computeNextOccurrenceUtcForRule,
  formatNextReminderLabel,
} from "./nextReminderOccurrence";

/** @deprecated Use pickNextHomeReminder */
export { pickNextHomeReminder as pickNextReminderRuleForHome } from "./nextReminderOccurrence";

import type { Pool } from "pg";
import {
  loadReminderMessengerChannelBindings,
  loadReminderRuleForMessengerTopicDisable,
} from "@/infra/repos/pgReminderMessengerTopicDisable";

export function loadReminderOccurrenceRuleForMessengerTopicDisable(
  pool: Pool,
  params: {
    platformUserId: string;
    integratorOccurrenceId: string;
  },
) {
  return loadReminderRuleForMessengerTopicDisable(pool, params);
}

export function loadMessengerChannelBindingsForReminderTopicDisable(pool: Pool, platformUserId: string) {
  return loadReminderMessengerChannelBindings(pool, platformUserId);
}

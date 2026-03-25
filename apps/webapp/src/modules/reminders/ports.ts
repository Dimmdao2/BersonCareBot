import type { ReminderRule, ReminderUpdateSchedule } from "./types";

export type ReminderRulesPort = {
  listByPlatformUser(platformUserId: string): Promise<ReminderRule[]>;
  getByPlatformUserAndCategory(platformUserId: string, category: string): Promise<ReminderRule | null>;
  updateEnabled(ruleIntegratorId: string, enabled: boolean): Promise<void>;
  updateSchedule(ruleIntegratorId: string, schedule: ReminderUpdateSchedule): Promise<void>;
};

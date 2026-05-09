import type {
  ReminderIntent,
  ReminderLinkedObjectType,
  ReminderRule,
  ReminderUpdateSchedule,
} from "./types";
import type { SlotsV1ScheduleData } from "./scheduleSlots";

export type ReminderRuleCreateInput = {
  platformUserId: string;
  integratorUserId: string;
  linkedObjectType: ReminderLinkedObjectType;
  linkedObjectId: string | null;
  customTitle: string | null;
  customText: string | null;
  enabled: boolean;
  schedule: ReminderUpdateSchedule;
  scheduleType?: "interval_window" | "slots_v1";
  scheduleData?: SlotsV1ScheduleData | null;
  reminderIntent?: ReminderIntent;
  displayTitle?: string | null;
  displayDescription?: string | null;
  /** Defaults to Europe/Moscow in repo when omitted */
  timezone?: string;
  quietHoursStartMinute?: number | null;
  quietHoursEndMinute?: number | null;
};

export type ReminderRulesPort = {
  /** Bigint string as stored for integrator_user_id / reminder_rules. */
  resolveIntegratorUserId(platformUserId: string): Promise<string | null>;
  listByPlatformUser(platformUserId: string): Promise<ReminderRule[]>;
  /** Rules for unified management UI, newest first. */
  listByPlatformUserWithObjects(platformUserId: string): Promise<ReminderRule[]>;
  getByPlatformUserAndCategory(platformUserId: string, category: string): Promise<ReminderRule | null>;
  create(input: ReminderRuleCreateInput): Promise<ReminderRule>;
  /** Returns true if a row was deleted and belonged to the user. */
  delete(ruleIntegratorId: string, platformUserId: string): Promise<boolean>;
  updateEnabled(ruleIntegratorId: string, enabled: boolean): Promise<void>;
  updateSchedule(ruleIntegratorId: string, schedule: ReminderUpdateSchedule): Promise<void>;
  updateScheduleAndType(
    ruleIntegratorId: string,
    params: {
      scheduleType: "interval_window" | "slots_v1";
      intervalMinutes: number;
      windowStartMinute: number;
      windowEndMinute: number;
      daysMask: string;
      scheduleData: Record<string, unknown> | null;
      quietHoursStartMinute: number | null;
      quietHoursEndMinute: number | null;
    },
  ): Promise<void>;
  updateCustomTexts(
    ruleIntegratorId: string,
    customTitle: string | null,
    customText: string | null,
  ): Promise<void>;
  updateDisplayTexts(
    ruleIntegratorId: string,
    displayTitle: string | null,
    displayDescription: string | null,
  ): Promise<void>;
  setReminderMutedUntil(platformUserId: string, untilIso: string | null): Promise<void>;
  getReminderMutedUntil(platformUserId: string): Promise<string | null>;
  /** После успешного переименования страницы: обновить slug в `linked_object_id` для `content_page`. */
  retargetContentPageLinkedSlug(contentPageId: string, oldSlug: string, newSlug: string): Promise<void>;
};

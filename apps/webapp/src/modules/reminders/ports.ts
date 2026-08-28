import type {
  ReminderIntent,
  ReminderLinkedObjectType,
  ReminderRule,
  ReminderUpdateSchedule,
} from './types';
import type { SlotsV1ScheduleData } from './scheduleSlots';

export type ReminderRuleCreateInput = {
  /** Stable product id used to make an HTTP create retry idempotent. */
  integratorRuleId?: string;
  platformUserId: string;
  linkedObjectType: ReminderLinkedObjectType;
  linkedObjectId: string | null;
  customTitle: string | null;
  customText: string | null;
  enabled: boolean;
  schedule: ReminderUpdateSchedule;
  scheduleType?: 'interval_window' | 'slots_v1';
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
  /**
   * Does this person have a messenger channel binding (`public.user_channel_bindings`)?
   *
   * Track D (#987): this replaces `resolveIntegratorUserId`, which asked "does a retired numeric
   * identity exist for them" and used the answer as a stand-in for "is a bot channel available".
   * The two stopped being the same thing once accounts started existing without the retired id:
   * a patient with a canonical uuid and a selected bot could not create a reminder at all unless
   * they also had web push. The question is now asked directly, of the canonical binding table.
   */
  hasMessengerChannelBinding(platformUserId: string): Promise<boolean>;
  listByPlatformUser(platformUserId: string): Promise<ReminderRule[]>;
  /** Rules for unified management UI, newest first. */
  listByPlatformUserWithObjects(platformUserId: string): Promise<ReminderRule[]>;
  getByPlatformUserAndCategory(
    platformUserId: string,
    category: string,
  ): Promise<ReminderRule | null>;
  create(input: ReminderRuleCreateInput): Promise<ReminderRule>;
  /** Returns true if a row was deleted and belonged to the user. */
  delete(ruleIntegratorId: string, platformUserId: string): Promise<boolean>;
  updateEnabled(ruleIntegratorId: string, enabled: boolean): Promise<void>;
  updateSchedule(ruleIntegratorId: string, schedule: ReminderUpdateSchedule): Promise<void>;
  updateScheduleAndType(
    ruleIntegratorId: string,
    params: {
      scheduleType: 'interval_window' | 'slots_v1';
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
  retargetContentPageLinkedSlug(
    contentPageId: string,
    oldSlug: string,
    newSlug: string,
  ): Promise<void>;
  /** После пересоздания promo-инстанса: обновить `linked_object_id` у `rehab_program`. */
  retargetRehabProgramInstanceLinkedId(
    platformUserId: string,
    oldInstanceId: string,
    newInstanceId: string,
  ): Promise<number>;
  /** Web Push-only: drop planned/queued occurrences after schedule change. */
  cancelWebPushPendingOccurrences(ruleIntegratorId: string): Promise<void>;
};

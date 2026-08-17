import type { ReminderOccurrenceDraft, ReminderPlanRule } from './planDueReminderOccurrences';
import type {
  PatientReminderMaterializationOccurrence,
  PatientReminderMaterializationRule,
} from './materializePatientReminderDeliveries';
import type { PatientReminderReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';
import type { ChannelPreference } from '@/modules/channel-preferences/types';
import type { TopicChannelPrefRow } from '@/modules/patient-notifications/topicChannelPrefsPort';

export type PatientReminderRuleForMaterialization = ReminderPlanRule &
  PatientReminderMaterializationRule & { linkedTitle: string | null };

export type DuePatientReminderOccurrence = {
  ruleId: string;
  draft: ReminderOccurrenceDraft;
  occurrence: PatientReminderMaterializationOccurrence;
};

export type PatientReminderDeliveryTargetSnapshot = {
  telegramId?: string;
  maxId?: string;
  channelPreferences: ChannelPreference[];
  topicChannelRows: TopicChannelPrefRow[];
  emailRecipient?: string;
  emailVerified: boolean;
  muted: boolean;
  topicMasterEnabled: boolean;
  hasWebPushSubscription: boolean;
  vapidConfigured: boolean;
  smtpConfigured: boolean;
};

export type PatientReminderMaterializationSnapshot = {
  rules: PatientReminderRuleForMaterialization[];
  dueOccurrences: DuePatientReminderOccurrence[];
};

export type PatientReminderMaterializationPort = {
  readSnapshot(
    organizationId: string,
    nowIso: string,
  ): Promise<PatientReminderMaterializationSnapshot>;
  readDeliveryTargetSnapshot(input: {
    organizationId: string;
    platformUserId: string;
    integratorUserId: string;
    topicCode: string;
    nowIso: string;
  }): Promise<PatientReminderDeliveryTargetSnapshot | null>;
  materializeOccurrence(
    rule: PatientReminderRuleForMaterialization,
    draft: ReminderOccurrenceDraft,
    occurrence: PatientReminderMaterializationOccurrence,
    deliveries: PatientReminderReadyOutgoingDelivery[],
  ): Promise<'materialized' | 'dedup' | 'not_actionable' | 'no_channels'>;
};

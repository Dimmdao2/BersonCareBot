import type { ChannelPreference } from '@/modules/channel-preferences/types';
import type { TopicChannelPrefRow } from '@/modules/patient-notifications/topicChannelPrefsPort';

export type PatientStaffNotificationProfile = {
  userId: string;
  telegramId: string | null;
  maxId: string | null;
  hasWebPushSubscription: boolean;
  channelPreferences: ChannelPreference[];
  topicChannelPreferences: TopicChannelPrefRow[];
};

/**
 * Patient-only projection used when a patient event must fan out to staff in the same organization.
 * A non-patient request returns null so the existing staff-side ports remain the canonical path.
 */
export type PatientStaffNotificationProfilesPort = {
  listForCurrentPatientOrganization(input: {
    organizationId: string;
    topicCode: string;
  }): Promise<PatientStaffNotificationProfile[] | null>;
};

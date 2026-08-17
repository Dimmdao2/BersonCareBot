import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
} from '@bersoncare/db-principal';
import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type { ChannelCode, ChannelPreference } from '@/modules/channel-preferences/types';
import type {
  PatientStaffNotificationProfile,
  PatientStaffNotificationProfilesPort,
} from '@/modules/doctor-notifications/patientStaffNotificationProfilesPort';
import type { PatientTopicChannelCode } from '@/modules/patient-notifications/topicChannelRules';

const CHANNEL_CODES = ['telegram', 'max', 'vk', 'sms', 'email', 'web_push'] as const;
const TOPIC_CHANNEL_CODES = ['telegram', 'max', 'sms', 'email', 'web_push'] as const;

type StoredChannelPreference = {
  channel_code?: unknown;
  is_enabled_for_messages?: unknown;
  is_enabled_for_notifications?: unknown;
  is_preferred_for_auth?: unknown;
};

type StoredTopicChannelPreference = {
  topic_code?: unknown;
  channel_code?: unknown;
  is_enabled?: unknown;
};

type StoredProfile = {
  user_id?: unknown;
  telegram_id?: unknown;
  max_id?: unknown;
  has_web_push?: unknown;
  channel_preferences?: unknown;
  topic_channel_preferences?: unknown;
};

type StoredResult = {
  ok?: unknown;
  code?: unknown;
  profiles?: unknown;
};

function isChannelCode(value: unknown): value is ChannelCode {
  return typeof value === 'string' && (CHANNEL_CODES as readonly string[]).includes(value);
}

function isTopicChannelCode(value: unknown): value is PatientTopicChannelCode {
  return typeof value === 'string' && (TOPIC_CHANNEL_CODES as readonly string[]).includes(value);
}

function channelPreferences(value: unknown): ChannelPreference[] {
  const stored = Array.isArray(value) ? (value as StoredChannelPreference[]) : [];
  const byCode = new Map<ChannelCode, ChannelPreference>();
  for (const row of stored) {
    if (!isChannelCode(row.channel_code)) continue;
    byCode.set(row.channel_code, {
      channelCode: row.channel_code,
      isEnabledForMessages: row.is_enabled_for_messages !== false,
      isEnabledForNotifications: row.is_enabled_for_notifications !== false,
      isPreferredForAuth: row.is_preferred_for_auth === true,
    });
  }
  return CHANNEL_CODES.map(
    (code) =>
      byCode.get(code) ?? {
        channelCode: code,
        isEnabledForMessages: true,
        isEnabledForNotifications: true,
        isPreferredForAuth: false,
      },
  );
}

function topicChannelPreferences(value: unknown) {
  const stored = Array.isArray(value) ? (value as StoredTopicChannelPreference[]) : [];
  return stored.flatMap((row) =>
    typeof row.topic_code === 'string' && isTopicChannelCode(row.channel_code)
      ? [
          {
            topicCode: row.topic_code,
            channelCode: row.channel_code,
            isEnabled: row.is_enabled !== false,
          },
        ]
      : [],
  );
}

function mapProfile(value: unknown): PatientStaffNotificationProfile | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as StoredProfile;
  if (typeof row.user_id !== 'string') return null;
  return {
    userId: row.user_id,
    telegramId: typeof row.telegram_id === 'string' ? row.telegram_id : null,
    maxId: typeof row.max_id === 'string' ? row.max_id : null,
    hasWebPushSubscription: row.has_web_push === true,
    channelPreferences: channelPreferences(row.channel_preferences),
    topicChannelPreferences: topicChannelPreferences(row.topic_channel_preferences),
  };
}

export function createPgPatientStaffNotificationProfilesPort(): PatientStaffNotificationProfilesPort {
  return {
    async listForCurrentPatientOrganization({ organizationId, topicCode }) {
      if (getCurrentDbPrincipal()?.kind !== 'patient') return null;
      if (getCurrentDbPrincipalOrganizationId() !== organizationId) {
        throw new Error('patient_notification_organization_mismatch');
      }
      const result = await runWebappNamedRoot<{ result: StoredResult }>(
        getWebappSqlDb(),
        'app.read_current_patient_staff_notification_profiles(uuid,text)',
        [organizationId, topicCode],
        sql`SELECT app.read_current_patient_staff_notification_profiles(
          ${organizationId}::uuid,
          ${topicCode}::text
        ) AS result`,
      );
      const value = result.rows[0]?.result;
      if (value?.ok !== true) {
        throw new Error(typeof value?.code === 'string' ? value.code : 'patient_staff_profiles_failed');
      }
      const profiles = Array.isArray(value.profiles) ? value.profiles : [];
      return profiles.map(mapProfile).filter((row): row is PatientStaffNotificationProfile => row != null);
    },
  };
}

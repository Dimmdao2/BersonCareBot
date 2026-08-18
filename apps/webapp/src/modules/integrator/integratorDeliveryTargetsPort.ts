import type { ChannelPreference } from '@/modules/channel-preferences/types';
import type { TopicChannelPrefRow } from '@/modules/patient-notifications/topicChannelPrefsPort';

/** Ровно один непустой селектор личности; порядок разбора — platformUserId → phone → telegram → max. */
export type IntegratorDeliveryTargetSelector = {
  organizationId: string;
  phoneNormalized?: string;
  telegramId?: string;
  maxId?: string;
  platformUserId?: string;
  integratorUserId?: string;
  topicCode?: string;
  nowIso?: string;
};

/**
 * Та же форма фактов, что у `PatientReminderDeliveryTargetSnapshot`: база отдаёт факты, каналы
 * выбирает `resolvePatientNotificationChannels`. Ветка `ok: false` несёт НАЗВАННУЮ причину — без
 * неё «адресата нет» и «резолвер отказал» снова слиплись бы в один молчаливый `null`.
 */
export type IntegratorDeliveryTargetSnapshot =
  | { ok: false; code: string }
  | {
      ok: true;
      platformUserId: string;
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

export type IntegratorDeliveryTargetsPort = {
  readSnapshot(selector: IntegratorDeliveryTargetSelector): Promise<IntegratorDeliveryTargetSnapshot>;
};

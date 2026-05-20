import type { ChannelPreference } from "@/modules/channel-preferences/types";
import type { NotificationChannelCode } from "@/modules/patient-notifications/notificationChannelContract";
import type { PatientNotificationChannelAvailability } from "@/modules/patient-notifications/resolveNotificationChannels";

export type ResolvedPatientMessageChannels = {
  selectedChannels: NotificationChannelCode[];
};

function globalMessagesEnabled(prefs: ChannelPreference[], channelCode: NotificationChannelCode): boolean {
  const row = prefs.find((p) => p.channelCode === channelCode);
  return row ? row.isEnabledForMessages !== false : true;
}

/**
 * Каналы доставки ответа врача в чат: telegram / max / web_push / email по `is_enabled_for_messages`.
 */
export function resolvePatientMessageChannels(params: {
  availability: PatientNotificationChannelAvailability;
  channelPrefs: ChannelPreference[];
}): ResolvedPatientMessageChannels {
  const selectedChannels: NotificationChannelCode[] = [];
  const { availability: a, channelPrefs } = params;

  const consider = (code: NotificationChannelCode) => {
    switch (code) {
      case "telegram":
        if (!a.hasTelegram || !globalMessagesEnabled(channelPrefs, code)) return;
        break;
      case "max":
        if (!a.hasMax || !globalMessagesEnabled(channelPrefs, code)) return;
        break;
      case "email":
        if (
          !a.hasEmail ||
          !a.emailVerified ||
          a.smtpConfigured === false ||
          !globalMessagesEnabled(channelPrefs, code)
        ) {
          return;
        }
        break;
      case "web_push":
        if (
          !a.vapidConfigured ||
          !a.hasWebPushSubscription ||
          !globalMessagesEnabled(channelPrefs, code)
        ) {
          return;
        }
        break;
      default:
        return;
    }
    selectedChannels.push(code);
  };

  for (const code of ["web_push", "telegram", "max", "email"] as const) {
    consider(code);
  }

  return { selectedChannels };
}

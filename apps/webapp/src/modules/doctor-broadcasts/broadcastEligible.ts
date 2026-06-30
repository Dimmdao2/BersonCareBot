import { normalizePhone } from "@/modules/auth/phoneNormalize";
import { isValidPhoneE164 } from "@/modules/auth/phoneValidation";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import type {
  BroadcastAudienceFilter,
  BroadcastDeliveryPolicyKind,
  BroadcastNotificationPrefsFlags,
} from "./ports";
import type { BroadcastChannel } from "./broadcastChannels";

export type { BroadcastDeliveryPolicyKind, BroadcastNotificationPrefsFlags } from "./ports";

export function broadcastNotificationPrefsDefaults(): BroadcastNotificationPrefsFlags {
  return { telegram: true, max: true, sms: true };
}

/** Нет строки в batch по userId ⇒ все каналы вкл.; как synthetic default в getPreferences. */
export function resolveBroadcastNotificationPrefsFromBatch(
  map: ReadonlyMap<string, BroadcastNotificationPrefsFlags>,
  userId: string,
): BroadcastNotificationPrefsFlags {
  return map.get(userId) ?? broadcastNotificationPrefsDefaults();
}

function clientSmsPhoneValid(client: ClientListItem): boolean {
  if (!client.phone) return false;
  const normalized = normalizePhone(client.phone.trim());
  return isValidPhoneE164(normalized);
}

export function broadcastIncludeTelegramJob(
  audienceFilter: BroadcastAudienceFilter,
  prefs: BroadcastNotificationPrefsFlags,
  hasTelegramBinding: boolean,
): boolean {
  if (!hasTelegramBinding) return false;
  if (audienceFilter === "with_telegram") return true;
  if (audienceFilter === "with_max") return false;
  return prefs.telegram !== false;
}

export function broadcastIncludeMaxJob(
  audienceFilter: BroadcastAudienceFilter,
  prefs: BroadcastNotificationPrefsFlags,
  hasMaxBinding: boolean,
): boolean {
  if (!hasMaxBinding) return false;
  if (audienceFilter === "with_max") return true;
  if (audienceFilter === "with_telegram") return false;
  return prefs.max !== false;
}

export function broadcastIncludeSmsJob(
  audienceFilter: BroadcastAudienceFilter,
  prefs: BroadcastNotificationPrefsFlags,
  phoneValidE164: boolean,
): boolean {
  if (!phoneValidE164) return false;
  if (audienceFilter === "sms_only") return true;
  return prefs.sms !== false;
}

export function broadcastIncludeWebPushJob(
  channels: readonly BroadcastChannel[],
  webPushEligibleUserIds: ReadonlySet<string>,
  userId: string,
): boolean {
  if (!channels.includes("push")) return false;
  return webPushEligibleUserIds.has(userId);
}

export function broadcastClientHasAnyDelivery(
  client: ClientListItem,
  channels: readonly BroadcastChannel[],
  audienceFilter: BroadcastAudienceFilter,
  prefs: BroadcastNotificationPrefsFlags,
  webPushEligibleUserIds: ReadonlySet<string> = new Set(),
  emailEligibleUserIds: ReadonlySet<string> = new Set(),
): boolean {
  // Legacy bot_message = telegram + max
  const legacyBotMessage = channels.includes("bot_message");
  const wantsTelegram = channels.includes("telegram") || legacyBotMessage;
  const wantsMax = channels.includes("max") || legacyBotMessage;
  const wantsSms = channels.includes("sms");
  const wantsPush = channels.includes("push");
  const wantsEmail = channels.includes("email");
  const tg = Boolean(client.bindings.telegramId?.trim());
  const mx = Boolean(client.bindings.maxId?.trim());
  const smsOk = clientSmsPhoneValid(client);

  if (wantsTelegram && broadcastIncludeTelegramJob(audienceFilter, prefs, tg)) {
    return true;
  }
  if (wantsMax && broadcastIncludeMaxJob(audienceFilter, prefs, mx)) {
    return true;
  }
  if (wantsSms && broadcastIncludeSmsJob(audienceFilter, prefs, smsOk)) {
    return true;
  }
  if (wantsPush && broadcastIncludeWebPushJob(channels, webPushEligibleUserIds, client.userId)) {
    return true;
  }
  if (wantsEmail && emailEligibleUserIds.has(client.userId)) {
    return true;
  }
  return false;
}

export function filterEligibleBroadcastClients(
  clients: readonly ClientListItem[],
  channels: readonly BroadcastChannel[],
  audienceFilter: BroadcastAudienceFilter,
  prefsByUserId: ReadonlyMap<string, BroadcastNotificationPrefsFlags>,
  webPushEligibleUserIds: ReadonlySet<string> = new Set(),
  emailEligibleUserIds: ReadonlySet<string> = new Set(),
): ClientListItem[] {
  return clients.filter((c) =>
    broadcastClientHasAnyDelivery(
      c,
      channels,
      audienceFilter,
      resolveBroadcastNotificationPrefsFromBatch(prefsByUserId, c.userId),
      webPushEligibleUserIds,
      emailEligibleUserIds,
    ),
  );
}

export function deriveBroadcastDeliveryPolicy(
  audienceFilter: BroadcastAudienceFilter,
  channels: readonly BroadcastChannel[],
): { kind: BroadcastDeliveryPolicyKind; descriptionRu: string } {
  // Legacy bot_message = telegram + max
  const legacyBotMessage = channels.includes("bot_message");
  const wantsBot =
    legacyBotMessage || channels.includes("telegram") || channels.includes("max");
  const wantsSms = channels.includes("sms");
  const wantsPush = channels.includes("push");
  const wantsEmail = channels.includes("email");
  const emailPart = wantsEmail ? " Email — при подтверждённом адресе." : "";
  const pushPart = wantsPush
    ? " Web Push — при подписке PWA и включённой теме «Новости и обновления»."
    : "";

  if (!wantsBot && !wantsSms && !wantsPush && !wantsEmail) {
    return { kind: "none", descriptionRu: "Каналы доставки не выбраны." };
  }

  if (!wantsBot && !wantsSms && wantsPush && !wantsEmail) {
    return {
      kind: "respect_prefs_bot",
      descriptionRu: "Web Push — при подписке PWA и включённой теме «Новости и обновления».",
    };
  }

  if (!wantsBot && !wantsSms && !wantsPush && wantsEmail) {
    return {
      kind: "respect_prefs_bot",
      descriptionRu: "Email — при подтверждённом адресе.",
    };
  }

  if (!wantsBot && !wantsSms) {
    // only push+email
    return {
      kind: "respect_prefs_bot",
      descriptionRu: pushPart.trim() + emailPart,
    };
  }

  if (wantsBot && !wantsSms) {
    if (audienceFilter === "with_telegram") {
      return {
        kind: "telegram_isolate_bot",
        descriptionRu:
          "Сообщение в боте уйдёт только в Telegram (по привязке), даже если у пациента отключены уведомления; MAX не используется." +
          pushPart +
          emailPart,
      };
    }
    if (audienceFilter === "with_max") {
      return {
        kind: "max_isolate_bot",
        descriptionRu:
          "Сообщение в боте уйдёт только в MAX (по привязке), даже если у пациента отключены уведомления; Telegram не используется." +
          pushPart +
          emailPart,
      };
    }
    return {
      kind: "respect_prefs_bot",
      descriptionRu:
        "Сообщение в боте уйдёт в Telegram и/или MAX только при привязке и если у пациента включены уведомления для этого канала." +
        pushPart +
        emailPart,
    };
  }

  if (!wantsBot && wantsSms) {
    if (audienceFilter === "sms_only") {
      return {
        kind: "sms_isolate",
        descriptionRu:
          "SMS уйдёт на валидный номер, даже если у пациента отключены SMS-уведомления." + pushPart + emailPart,
      };
    }
    return {
      kind: "respect_prefs_sms",
      descriptionRu:
        "SMS только при валидном номере и если у пациента включены уведомления для SMS." + pushPart + emailPart,
    };
  }

  const smsIsolate = audienceFilter === "sms_only";
  const smsPart = smsIsolate
    ? " SMS — на валидный номер, независимо от настроек уведомлений."
    : " SMS — при валидном номере и включённых уведомлениях для SMS.";

  if (audienceFilter === "with_telegram") {
    return {
      kind: smsIsolate ? "telegram_isolate_bot_sms_isolate" : "telegram_isolate_bot_respect_prefs_sms",
      descriptionRu:
        `Сообщение в боте — только в Telegram, независимо от настроек; MAX не используется.${smsPart}` +
        pushPart +
        emailPart,
    };
  }
  if (audienceFilter === "with_max") {
    return {
      kind: smsIsolate ? "max_isolate_bot_sms_isolate" : "max_isolate_bot_respect_prefs_sms",
      descriptionRu:
        `Сообщение в боте — только в MAX, независимо от настроек; Telegram не используется.${smsPart}` +
        pushPart +
        emailPart,
    };
  }
  return {
    kind: "respect_prefs_bot_sms",
    descriptionRu:
      `Сообщение в боте — в мессенджеры с привязкой и включёнными уведомлениями.${smsPart}` +
      pushPart +
      emailPart,
  };
}

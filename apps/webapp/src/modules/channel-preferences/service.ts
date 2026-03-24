import { CHANNEL_LIST } from "./constants";
import type { ChannelPreferencesPort } from "./ports";
import type { ChannelCard, ChannelCode } from "./types";
import type { ChannelBindings } from "@/shared/types/session";

export type ChannelDeliveryContext = {
  /** Нормализованный телефон из сессии — для канала SMS. */
  phone?: string | null;
  /** Email подтверждён (верификация по коду). */
  emailVerified?: boolean;
};

function isLinked(bindings: ChannelBindings, code: ChannelCode, ctx?: ChannelDeliveryContext): boolean {
  switch (code) {
    case "telegram":
      return Boolean(bindings.telegramId);
    case "max":
      return Boolean(bindings.maxId);
    case "vk":
      return Boolean(bindings.vkId);
    case "sms":
      return Boolean(ctx?.phone?.trim());
    case "email":
      return Boolean(ctx?.emailVerified);
    default:
      return false;
  }
}

export function createChannelPreferencesService(port: ChannelPreferencesPort) {
  return {
    async getChannelCards(
      userId: string,
      bindings: ChannelBindings,
      delivery?: ChannelDeliveryContext
    ): Promise<ChannelCard[]> {
      const prefs = await port.getPreferences(userId);
      const byCode = new Map(prefs.map((p) => [p.channelCode, p]));
      return CHANNEL_LIST.map((ch) => ({
        code: ch.code,
        title: ch.title,
        openUrl: ch.openUrl,
        isLinked: isLinked(bindings, ch.code, delivery),
        isImplemented: ch.implemented,
        isEnabledForMessages: byCode.get(ch.code)?.isEnabledForMessages ?? true,
        isEnabledForNotifications: byCode.get(ch.code)?.isEnabledForNotifications ?? true,
      }));
    },
    async updatePreference(
      userId: string,
      channelCode: ChannelCode,
      patch: { isEnabledForMessages: boolean; isEnabledForNotifications: boolean }
    ): Promise<void> {
      await port.upsertPreference({
        userId,
        channelCode,
        isEnabledForMessages: patch.isEnabledForMessages,
        isEnabledForNotifications: patch.isEnabledForNotifications,
      });
    },
  };
}

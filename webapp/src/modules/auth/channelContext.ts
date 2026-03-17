/**
 * Контекст канала для кросс-канальной авторизации (Telegram, VK, Max, web).
 * Используется при привязке номера телефона к chat ID мессенджера или при входе из web.
 */

export type ChannelKind = "telegram" | "vk" | "max" | "web";

export type ChannelContext = {
  channel: ChannelKind;
  /** Идентификатор чата в канале (например telegramId, vkId). Для web — произвольный стабильный id (например device/session). */
  chatId: string;
  /** Опционально: имя/ник с платформы для отображения. */
  displayName?: string;
};

export function channelToBindingKey(
  channel: ChannelKind
): "telegramId" | "vkId" | "maxId" | null {
  switch (channel) {
    case "telegram":
      return "telegramId";
    case "vk":
      return "vkId";
    case "max":
      return "maxId";
    case "web":
      return null;
  }
}

import type { SessionUser } from "@/shared/types/session";
import type { ChannelContext } from "./channelContext";
import { channelToBindingKey } from "./channelContext";

/**
 * Порт: поиск и создание/привязка пользователя по номеру телефона.
 * Используется после успешной верификации SMS для привязки канала к пользователю.
 */
export type UserByPhonePort = {
  findByPhone(normalizedPhone: string): Promise<SessionUser | null>;
  /** Загрузка сессионного пользователя по id платформы (для messenger login и др.). */
  findByUserId(userId: string): Promise<SessionUser | null>;
  /** Нормализованный телефон платформенного пользователя без загрузки привязок. */
  getPhoneByUserId(userId: string): Promise<string | null>;
  /** Создаёт пользователя с номером и привязкой канала или обновляет привязку у существующего. */
  createOrBind(phone: string, context: ChannelContext): Promise<SessionUser>;
};

"use server";

/**
 * Серверные действия для страницы настроек.
 * Вызываются при переключении настроек каналов (сообщения, уведомления) в блоке подписок.
 */

import { revalidatePath } from "next/cache";
import { requireSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ChannelCode } from "@/modules/channel-preferences/types";

/** Сохраняет настройки канала для текущего пользователя и обновляет страницу настроек. */
export async function updateChannelPreference(
  channelCode: ChannelCode,
  isEnabledForMessages: boolean,
  isEnabledForNotifications: boolean
) {
  const session = await requireSession();
  const deps = buildAppDeps();
  await deps.channelPreferences.updatePreference(session.user.userId, channelCode, {
    isEnabledForMessages,
    isEnabledForNotifications,
  });
  revalidatePath("/app/settings");
}

"use server";

import { revalidatePath } from "next/cache";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { allowedChannelsForTopic, isPatientTopicChannelCode } from "@/modules/patient-notifications/topicChannelRules";

async function revalidateNotificationSurfaces() {
  revalidatePath(routePaths.notifications);
  revalidatePath(routePaths.notificationSettings);
  revalidatePath(routePaths.profile);
  revalidatePath(routePaths.patient);
}

export async function setNotificationTopicMasterEnabled(
  topicCode: unknown,
  enabled: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const tc = typeof topicCode === "string" ? topicCode.trim() : "";
  const en = typeof enabled === "boolean" ? enabled : null;
  if (!tc || en === null) {
    return { ok: false, message: "Некорректный запрос" };
  }

  try {
    const session = await requirePatientAccessWithPhone(routePaths.notificationSettings);
    const deps = buildAppDeps();
    await deps.patientNotificationTopics.setTopicEnabled(session.user.userId, tc, en);
    await revalidateNotificationSurfaces();
    return { ok: true };
  } catch {
    return { ok: false, message: "Не удалось сохранить настройки" };
  }
}

export async function setTopicChannelNotificationEnabled(
  topicCode: unknown,
  channelCode: unknown,
  enabled: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const tc = typeof topicCode === "string" ? topicCode.trim() : "";
  const cc = typeof channelCode === "string" ? channelCode.trim() : "";
  const en = typeof enabled === "boolean" ? enabled : null;
  if (!tc || !cc || en === null) {
    return { ok: false, message: "Некорректный запрос" };
  }
  if (!isPatientTopicChannelCode(cc)) {
    return { ok: false, message: "Некорректный канал" };
  }
  const allowed = allowedChannelsForTopic(tc);
  if (!(allowed as readonly string[]).includes(cc)) {
    return { ok: false, message: "Канал недоступен для этой темы" };
  }

  try {
    const session = await requirePatientAccessWithPhone(routePaths.notificationSettings);
    const deps = buildAppDeps();
    const emailFields = await deps.userProjection.getProfileEmailFields(session.user.userId);
    const emailVerified = Boolean(emailFields.emailVerifiedAt);
    const hasTelegram = Boolean(session.user.bindings.telegramId?.trim());
    const hasMax = Boolean(session.user.bindings.maxId?.trim());
    const prefs = await deps.channelPreferencesPort.getPreferences(session.user.userId);
    const globalWebPushEnabled =
      prefs.find((p) => p.channelCode === "web_push")?.isEnabledForNotifications !== false;

    if (cc === "telegram" && !hasTelegram) {
      return { ok: false, message: "Сначала подключите Telegram" };
    }
    if (cc === "max" && !hasMax) {
      return { ok: false, message: "Сначала подключите Max" };
    }
    if (cc === "email" && !emailVerified) {
      return { ok: false, message: "Подтвердите email" };
    }
    if (cc === "web_push") {
      if (!globalWebPushEnabled) {
        return { ok: false, message: "Включите Push в блоке «Каналы»" };
      }
      const hasPush = await deps.webPushSubscriptions.hasAnyForUserId(session.user.userId);
      if (!hasPush) {
        return { ok: false, message: "Включите Push в блоке «Push в приложении»" };
      }
    }

    await deps.topicChannelPrefs.upsert(session.user.userId, tc, cc, en);
    await revalidateNotificationSurfaces();
    return { ok: true };
  } catch {
    return { ok: false, message: "Не удалось сохранить настройки" };
  }
}

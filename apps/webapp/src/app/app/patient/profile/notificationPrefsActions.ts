"use server";

import { revalidatePath } from "next/cache";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { allowedChannelsForTopic, isPatientTopicChannelCode } from "@/modules/patient-notifications/topicChannelRules";

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
    const session = await requirePatientAccessWithPhone(routePaths.profile);
    const deps = buildAppDeps();
    const emailFields = await deps.userProjection.getProfileEmailFields(session.user.userId);
    const emailVerified = Boolean(emailFields.emailVerifiedAt);
    const hasTelegram = Boolean(session.user.bindings.telegramId?.trim());
    const hasMax = Boolean(session.user.bindings.maxId?.trim());

    if (cc === "telegram" && !hasTelegram) {
      return { ok: false, message: "Сначала подключите Telegram" };
    }
    if (cc === "max" && !hasMax) {
      return { ok: false, message: "Сначала подключите Max" };
    }
    if (cc === "email" && !emailVerified) {
      return { ok: false, message: "Подтвердите email" };
    }

    await deps.topicChannelPrefs.upsert(session.user.userId, tc, cc, en);
    revalidatePath(routePaths.profile);
    revalidatePath(routePaths.patient);
    return { ok: true };
  } catch {
    return { ok: false, message: "Не удалось сохранить настройки" };
  }
}

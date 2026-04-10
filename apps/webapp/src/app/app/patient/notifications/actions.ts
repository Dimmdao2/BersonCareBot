"use server";

import { revalidatePath } from "next/cache";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { parseChannelNotificationInput } from "./parseChannelPreferenceInput";

export async function setChannelNotificationEnabled(
  channelCode: unknown,
  enabled: unknown
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = parseChannelNotificationInput(channelCode, enabled);
  if (!parsed.ok) {
    return { ok: false, message: "Некорректный запрос" };
  }
  const { code, enabled: nextEnabled } = parsed;

  try {
    const session = await requirePatientAccessWithPhone(routePaths.notifications);
    const deps = buildAppDeps();
    const emailFields = await deps.userProjection.getProfileEmailFields(session.user.userId);
    const emailVerified = Boolean(emailFields.emailVerifiedAt);

    const cards = await deps.channelPreferences.getChannelCards(session.user.userId, session.user.bindings, {
      phone: session.user.phone,
      emailVerified,
    });
    const card = cards.find((c) => c.code === code);
    if (!card) {
      return { ok: false, message: "Канал не найден" };
    }
    /** Нельзя менять доставку для канала, который пользователь не привязал (нет телефона / email / мессенджера). */
    if (!card.isLinked) {
      return { ok: false, message: "Сначала подключите этот канал" };
    }

    await deps.channelPreferences.updatePreference(session.user.userId, code, {
      isEnabledForMessages: card.isEnabledForMessages,
      isEnabledForNotifications: nextEnabled,
    });
    revalidatePath(routePaths.notifications);
    revalidatePath(routePaths.patient);
    return { ok: true };
  } catch {
    return { ok: false, message: "Не удалось сохранить настройки" };
  }
}

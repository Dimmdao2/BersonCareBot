"use server";

/** Действия профиля — onboarding surface (`patientServerActionPageAllowsOnboardingOnly` / SPEC §4 активация). */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import type { OtpUiChannel } from "@/modules/auth/otpChannelUi";

const authOtpChannelSchema = z.enum(["auto", "telegram", "max", "email", "sms"]);

export async function updateDisplayName(newName: string) {
  const trimmedName = newName.trim();
  if (!trimmedName) return;
  if (trimmedName.length > 200) return;

  const session = await requirePatientAccess(routePaths.profile);
  const deps = buildAppDeps();
  try {
    await deps.userProjection.updateDisplayName(session.user.userId, trimmedName);
  } catch (err) {
    console.error("updateDisplayName failed:", err);
    return;
  }
  revalidatePath(routePaths.profile);
}

/** Сохранить предпочтительный канал доставки кода при входе по телефону (или сброс на «авто»). */
export async function setPreferredAuthOtpChannelAction(
  channel: unknown
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = authOtpChannelSchema.safeParse(channel);
  if (!parsed.success) {
    return { ok: false, message: "Некорректный канал" };
  }

  try {
    const session = await requirePatientAccess(routePaths.profile);
    const deps = buildAppDeps();
    const emailFields = await deps.userProjection.getProfileEmailFields(session.user.userId);
    const channelCards = await deps.channelPreferences.getChannelCards(
      session.user.userId,
      session.user.bindings,
      {
        phone: session.user.phone,
        emailVerified: Boolean(emailFields.emailVerifiedAt),
      }
    );

    const order: OtpUiChannel[] = ["telegram", "max", "email", "sms"];
    const available = new Set(
      order.filter((code) => {
        const c = channelCards.find((x) => x.code === code);
        return c?.isLinked && c?.isImplemented;
      })
    );

    if (parsed.data === "auto") {
      await deps.channelPreferences.setPreferredAuthOtpChannel(session.user.userId, null);
      revalidatePath(routePaths.profile);
      return { ok: true };
    }

    if (!available.has(parsed.data)) {
      return { ok: false, message: "Этот канал недоступен. Сначала привяжите его." };
    }

    await deps.channelPreferences.setPreferredAuthOtpChannel(session.user.userId, parsed.data);
    revalidatePath(routePaths.profile);
    return { ok: true };
  } catch {
    return { ok: false, message: "Не удалось сохранить настройку" };
  }
}

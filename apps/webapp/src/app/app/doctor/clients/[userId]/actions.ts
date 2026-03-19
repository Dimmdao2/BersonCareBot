"use server";

import { revalidatePath } from "next/cache";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";

export type SendMessageResult = { success: boolean; error?: string };

export async function sendMessageAction(
  _prev: SendMessageResult,
  formData: FormData
): Promise<SendMessageResult> {
  const session = await requireDoctorAccess();
  const userId = (formData.get("userId") as string)?.trim();
  const text = (formData.get("text") as string)?.trim();
  const category = (formData.get("category") as string)?.trim() || "organizational";
  const channelBindings: Record<string, string> = {};
  if (formData.get("channel_telegram") && formData.get("channel_telegram_id")) {
    channelBindings.telegramId = formData.get("channel_telegram_id") as string;
  }
  if (formData.get("channel_max") && formData.get("channel_max_id")) {
    channelBindings.maxId = formData.get("channel_max_id") as string;
  }
  if (formData.get("channel_vk") && formData.get("channel_vk_id")) {
    channelBindings.vkId = formData.get("channel_vk_id") as string;
  }

  if (!userId) return { success: false, error: "Ошибка сессии." };
  if (!text) return { success: false, error: "Введите текст сообщения." };

  const deps = buildAppDeps();
  const result = await deps.doctorMessaging.sendMessage({
    userId,
    senderId: session.user.userId,
    text,
    category,
    channelBindings,
  });
  revalidatePath(`/app/doctor/clients/${userId}`);
  revalidatePath("/app/doctor/messages");
  return { success: result.success, error: result.success ? undefined : "Нет выбранных каналов доставки." };
}

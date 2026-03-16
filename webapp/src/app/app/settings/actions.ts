"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ChannelCode } from "@/modules/channel-preferences/types";

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

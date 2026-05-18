import { and, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { platformUsers, userNotificationTopics } from "../../../db/schema/schema";

export type ReminderTopicGateResult = {
  muted: boolean;
  topicMasterEnabled: boolean;
};

/**
 * Mute: `platform_users.reminder_muted_until`.
 * Тема: строка в `user_notification_topics`; если нет строки — считаем тему включённой (канальные prefs решают).
 */
export async function readReminderWebappNotifyGate(
  platformUserId: string,
  topicCode: string,
  nowIso?: string,
): Promise<ReminderTopicGateResult> {
  const db = getDrizzle();
  const now = nowIso ?? new Date().toISOString();

  const puRows = await db
    .select({ reminderMutedUntil: platformUsers.reminderMutedUntil })
    .from(platformUsers)
    .where(eq(platformUsers.id, platformUserId))
    .limit(1);

  const mutedUntil = puRows[0]?.reminderMutedUntil;
  const muted = Boolean(mutedUntil && mutedUntil > now);

  const topicRows = await db
    .select({ isEnabled: userNotificationTopics.isEnabled })
    .from(userNotificationTopics)
    .where(and(eq(userNotificationTopics.userId, platformUserId), eq(userNotificationTopics.topicCode, topicCode.trim())));

  const topicMasterEnabled = topicRows[0] ? topicRows[0].isEnabled : true;

  return { muted, topicMasterEnabled };
}

import { eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type { TopicChannelPrefRow, TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import { isPatientTopicChannelCode } from "@/modules/patient-notifications/topicChannelRules";
import { userNotificationTopicChannels } from "../../../db/schema/schema";

function mapRow(row: typeof userNotificationTopicChannels.$inferSelect): TopicChannelPrefRow | null {
  const channelCode = row.channelCode.trim();
  if (!isPatientTopicChannelCode(channelCode)) return null;
  return {
    topicCode: row.topicCode.trim(),
    channelCode,
    isEnabled: row.isEnabled,
  };
}

export function createPgTopicChannelPrefsPort(): TopicChannelPrefsPort {
  return {
    async listByUserId(userId: string) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(userNotificationTopicChannels)
        .where(eq(userNotificationTopicChannels.userId, userId));
      return rows.map(mapRow).filter((r): r is TopicChannelPrefRow => r != null);
    },
    async upsert(userId, topicCode, channelCode, isEnabled) {
      const db = getDrizzle();
      await db
        .insert(userNotificationTopicChannels)
        .values({
          userId,
          topicCode: topicCode.trim(),
          channelCode,
          isEnabled,
          updatedAt: sql`now()` as unknown as string,
        })
        .onConflictDoUpdate({
          target: [
            userNotificationTopicChannels.userId,
            userNotificationTopicChannels.topicCode,
            userNotificationTopicChannels.channelCode,
          ],
          set: {
            isEnabled,
            updatedAt: sql`now()` as unknown as string,
          },
        });
    },
  };
}

export const inMemoryTopicChannelPrefsPort: TopicChannelPrefsPort = {
  listByUserId: async () => [],
  upsert: async () => {},
};

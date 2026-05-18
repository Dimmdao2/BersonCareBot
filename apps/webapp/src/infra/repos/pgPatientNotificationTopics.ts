import { eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type {
  NotificationTopicMasterRow,
  PatientNotificationTopicsPort,
} from "@/modules/patient-notifications/patientNotificationTopicsPort";
import { userNotificationTopics } from "../../../db/schema/schema";

export function createPgPatientNotificationTopicsPort(): PatientNotificationTopicsPort {
  return {
    async listByUserId(userId: string) {
      const db = getDrizzle();
      const rows = await db
        .select({
          topicCode: userNotificationTopics.topicCode,
          isEnabled: userNotificationTopics.isEnabled,
        })
        .from(userNotificationTopics)
        .where(eq(userNotificationTopics.userId, userId));
      return rows.map(
        (r): NotificationTopicMasterRow => ({
          topicCode: r.topicCode.trim(),
          isEnabled: r.isEnabled,
        }),
      );
    },
    async setTopicEnabled(userId, topicCode, isEnabled) {
      const db = getDrizzle();
      await db
        .insert(userNotificationTopics)
        .values({
          userId,
          topicCode: topicCode.trim(),
          isEnabled,
          updatedAt: sql`now()` as unknown as string,
        })
        .onConflictDoUpdate({
          target: [userNotificationTopics.userId, userNotificationTopics.topicCode],
          set: {
            isEnabled,
            updatedAt: sql`now()` as unknown as string,
          },
        });
    },
  };
}

export const inMemoryPatientNotificationTopicsPort: PatientNotificationTopicsPort = {
  listByUserId: async () => [],
  setTopicEnabled: async () => {},
};

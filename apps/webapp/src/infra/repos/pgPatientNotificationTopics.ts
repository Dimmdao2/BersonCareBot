import { eq, inArray, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import type {
  NotificationTopicMasterRow,
  PatientNotificationTopicsPort,
} from '@/modules/patient-notifications/patientNotificationTopicsPort';
import { userNotificationTopics } from '../../../db/schema/schema';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

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
    async listByUserIds(userIds) {
      const uniqueUserIds = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))];
      if (uniqueUserIds.length === 0) return new Map();
      const db = getDrizzle();
      const rows = await db
        .select({
          userId: userNotificationTopics.userId,
          topicCode: userNotificationTopics.topicCode,
          isEnabled: userNotificationTopics.isEnabled,
        })
        .from(userNotificationTopics)
        .where(inArray(userNotificationTopics.userId, uniqueUserIds));
      const byUserId = new Map<string, NotificationTopicMasterRow[]>();
      for (const row of rows) {
        const current = byUserId.get(row.userId) ?? [];
        current.push({ topicCode: row.topicCode.trim(), isEnabled: row.isEnabled });
        byUserId.set(row.userId, current);
      }
      return byUserId;
    },
    async setTopicEnabled(userId, topicCode, isEnabled) {
      const result = await runWebappNamedRoot<{ saved: boolean }>(
        getWebappSqlDb(),
        'app.set_current_patient_notification_topic(text,boolean)',
        [topicCode.trim(), isEnabled],
        sql`SELECT app.set_current_patient_notification_topic(
          ${topicCode.trim()}::text,
          ${isEnabled}::boolean
        ) AS saved`,
      );
      void userId;
      if (result.rows[0]?.saved !== true) throw new Error('notification_topic_rejected');
    },
  };
}

export const inMemoryPatientNotificationTopicsPort: PatientNotificationTopicsPort = {
  listByUserId: async () => [],
  listByUserIds: async () => new Map(),
  setTopicEnabled: async () => {},
};

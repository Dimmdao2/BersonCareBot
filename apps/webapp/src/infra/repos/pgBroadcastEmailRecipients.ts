/**
 * pg-реализация BroadcastEmailRecipientsPort.
 * Этап 4a (2026-06-13).
 *
 * Возвращает Map userId → emailNormalized для пользователей
 * с подтверждённым email из заданного списка userId.
 *
 * Весь SQL — Drizzle db.execute(sql`...`). pool.query/client.query не используются.
 */
import { sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { drizzleSqlUuidInList } from '@/modules/analytics/analyticsAudience';
import { drizzlePrimaryEmailCol } from '@/infra/repos/userContactsSql';
import { platformUsers } from '../../../db/schema/schema';
import type { BroadcastEmailRecipientsPort } from '@/modules/doctor-broadcasts/fanOutBroadcastEmail';

export function createPgBroadcastEmailRecipientsPort(): BroadcastEmailRecipientsPort {
  return {
    async getVerifiedEmailsForUserIds(userIds: string[]): Promise<Map<string, string>> {
      if (userIds.length === 0) return new Map();

      const db = getDrizzle();
      const result = await db.execute<{ id: string; email_normalized: string }>(sql`
        SELECT pu.id::text, ${drizzlePrimaryEmailCol} AS email_normalized
        FROM ${platformUsers} pu
        WHERE pu.id IN (${drizzleSqlUuidInList(userIds)})
          AND ${drizzlePrimaryEmailCol} IS NOT NULL
          AND pu.email_verified_at IS NOT NULL
          AND pu.merged_into_id IS NULL
      `);

      const map = new Map<string, string>();
      for (const row of result.rows as Array<{ id: string; email_normalized: string }>) {
        if (row.id && row.email_normalized) {
          map.set(row.id, row.email_normalized);
        }
      }
      return map;
    },
  };
}

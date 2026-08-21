/**
 * Read-only aggregation: count users with each broadcast channel connected.
 * Used for channel tiles in the broadcast form.
 * Wave 3 phase 15G — migrated from pool.query to Drizzle db.execute(sql).
 * Этап 4a (2026-06-13) — добавлены реальные счётчики telegram/max/push/email.
 */
import { and, count, countDistinct, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb } from '@/infra/db/runWebappSql';
import {
  platformUsers,
  userChannelBindings,
  userContacts,
  userWebPushSubscriptions,
} from '../../../db/schema/schema';
import {
  drizzlePrimaryEmailCol,
  drizzlePrimaryEmailConfirmedAtCol,
  drizzlePrimaryPhoneCol,
} from '@/infra/repos/userContactsSql';
import type {
  BroadcastChannelCounts,
  BroadcastChannelCountsPort,
} from '@/modules/doctor-broadcasts/draftPort';

export function createPgBroadcastChannelCountsPort(): BroadcastChannelCountsPort {
  const parse = (r: { rows: unknown[] }) =>
    parseInt((r.rows[0] as { cnt: string } | undefined)?.cnt ?? '0', 10);

  return {
    async getChannelConnectionCounts(): Promise<BroadcastChannelCounts> {
      const db = getDrizzle();
      const [tgResult, maxResult, smsResult, pushResult, emailResult] = await Promise.all([
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(DISTINCT user_id)::text AS cnt
          FROM user_channel_bindings
          WHERE channel_code = 'telegram'
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(DISTINCT user_id)::text AS cnt
          FROM user_channel_bindings
          WHERE channel_code = 'max'
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(DISTINCT uc.platform_user_id)::text AS cnt
          FROM ${userContacts} uc
          INNER JOIN ${platformUsers} pu ON pu.id = uc.platform_user_id
          WHERE uc.contact_kind = 'phone'
            AND uc.is_primary = true
            AND pu.merged_into_id IS NULL
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(DISTINCT user_id)::text AS cnt
          FROM user_web_push_subscriptions
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(DISTINCT uc.platform_user_id)::text AS cnt
          FROM ${userContacts} uc
          INNER JOIN ${platformUsers} pu ON pu.id = uc.platform_user_id
          WHERE uc.contact_kind = 'email'
            AND uc.is_primary = true
            AND uc.confirmed_at IS NOT NULL
            AND pu.merged_into_id IS NULL
        `),
      ]);

      const telegram = parse(tgResult);
      const max = parse(maxResult);
      const sms = parse(smsResult);
      const push = parse(pushResult);
      const email = parse(emailResult);

      return {
        bot_message: telegram, // legacy alias
        telegram,
        max,
        sms,
        push,
        email,
      };
    },

    async getChannelCountsByUserIds(userIds: readonly string[]): Promise<BroadcastChannelCounts> {
      if (userIds.length === 0) {
        return { bot_message: 0, telegram: 0, max: 0, sms: 0, push: 0, email: 0 };
      }
      const db = getWebappSqlDb();
      const ids = [...userIds];
      const [tgResult, maxResult, smsResult, pushResult, emailResult] = await Promise.all([
        db
          .select({ cnt: countDistinct(userChannelBindings.userId) })
          .from(userChannelBindings)
          .where(
            and(
              eq(userChannelBindings.channelCode, 'telegram'),
              inArray(userChannelBindings.userId, ids),
            ),
          ),
        db
          .select({ cnt: countDistinct(userChannelBindings.userId) })
          .from(userChannelBindings)
          .where(
            and(eq(userChannelBindings.channelCode, 'max'), inArray(userChannelBindings.userId, ids)),
          ),
        db
          .select({ cnt: count() })
          .from(platformUsers)
          .where(
            and(
              inArray(platformUsers.id, ids),
              isNotNull(drizzlePrimaryPhoneCol),
              isNull(platformUsers.mergedIntoId),
            ),
          ),
        db
          .select({ cnt: countDistinct(userWebPushSubscriptions.userId) })
          .from(userWebPushSubscriptions)
          .where(inArray(userWebPushSubscriptions.userId, ids)),
        db
          .select({ cnt: count() })
          .from(platformUsers)
          .where(
            and(
              inArray(platformUsers.id, ids),
              isNotNull(drizzlePrimaryEmailConfirmedAtCol),
              isNotNull(drizzlePrimaryEmailCol),
              isNull(platformUsers.mergedIntoId),
            ),
          ),
      ]);

      const telegram = Number(tgResult[0]?.cnt ?? 0);
      const max = Number(maxResult[0]?.cnt ?? 0);
      const sms = Number(smsResult[0]?.cnt ?? 0);
      const push = Number(pushResult[0]?.cnt ?? 0);
      const email = Number(emailResult[0]?.cnt ?? 0);

      return { bot_message: telegram, telegram, max, sms, push, email };
    },
  };
}

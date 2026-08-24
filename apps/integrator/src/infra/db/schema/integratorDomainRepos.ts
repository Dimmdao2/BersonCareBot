/**
 * Таблицы домена P3 reminders.
 * Колонки и ограничения сверены с миграциями integrator + `apps/webapp/db/schema/schema.ts`
 * (FK в Drizzle не тянем — только уникальные индексы/CHECK, как в P1).
 *
 * The reminder occurrence table this file used to hold (`integrator.user_reminder_occurrences`)
 * was dropped by Track D's consolidation (#987) — the single physical occurrence store is now
 * `public.reminder_occurrence_history`, mirrored for this app in `../schema/integratorPublicProduct.ts`.
 */
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const contentAccessGrants = pgTable(
  'content_access_grants',
  {
    id: text().primaryKey().notNull(),
    userId: bigint('user_id', { mode: 'number' }).notNull(),
    contentId: text('content_id').notNull(),
    purpose: text().notNull(),
    tokenHash: text('token_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    metaJson: jsonb('meta_json').default({}).notNull(),
    organizationId: uuid('organization_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('content_access_grants_user_expires_idx').using(
      'btree',
      table.userId.asc().nullsLast().op('int8_ops'),
      table.expiresAt.desc().nullsFirst().op('int8_ops'),
    ),
  ],
);

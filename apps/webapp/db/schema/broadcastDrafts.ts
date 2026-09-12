import {
  pgTable, uuid, text, jsonb, timestamp, index, uniqueIndex, foreignKey,
} from 'drizzle-orm/pg-core';
import { beOrganizations } from './bookingEngine';

/**
 * Черновик рассылки врача: последнее несохранённое состояние формы «Рассылки».
 *
 * Строка принадлежит клинике (`organization_id`), а уникальность — паре «врач + клиника»:
 * один и тот же врач в двух клиниках ведёт два независимых черновика.
 */
export const broadcastDrafts = pgTable(
  'broadcast_drafts',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    doctorUserId: uuid('doctor_user_id').notNull(),
    category: text('category'),
    audience: text('audience'),
    channels: jsonb('channels').default([]).notNull(),
    title: text('title').default('').notNull(),
    body: text('body').default('').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    mediaUrl: text('media_url'),
    mediaType: text('media_type'),
    organizationId: uuid('organization_id').notNull(),
  },
  (table) => [
    index('idx_broadcast_drafts_organization_id').on(table.organizationId),
    uniqueIndex('broadcast_drafts_doctor_user_id_organization_id_key')
      .on(table.doctorUserId, table.organizationId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'broadcast_drafts_organization_id_fkey',
    }).onDelete('cascade'),
  ],
);

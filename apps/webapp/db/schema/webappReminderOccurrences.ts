import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { beOrganizations } from './bookingEngine';
import { platformUsers } from './schema';

/** Planned/sent occurrences for Web Push-only rules (`reminder_rules.integrator_user_id IS NULL`). */
export const webappReminderOccurrences = pgTable(
  'webapp_reminder_occurrences',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id'),
    integratorRuleId: text('integrator_rule_id').notNull(),
    platformUserId: uuid('platform_user_id').notNull(),
    occurrenceKey: text('occurrence_key').notNull(),
    plannedAt: timestamp('planned_at', { withTimezone: true, mode: 'string' }).notNull(),
    status: text('status').default('planned').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
    failedAt: timestamp('failed_at', { withTimezone: true, mode: 'string' }),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_webapp_reminder_occurrences_organization_id').on(table.organizationId),
    uniqueIndex('webapp_reminder_occurrences_rule_key_uniq').on(
      table.integratorRuleId,
      table.occurrenceKey,
    ),
    index('webapp_reminder_occurrences_due_idx')
      .on(table.status, table.plannedAt)
      .where(sql`(status = 'planned')`),
    index('webapp_reminder_occurrences_platform_user_idx').on(table.platformUserId),
    index('webapp_reminder_occurrences_rule_idx').on(table.integratorRuleId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'webapp_reminder_occurrences_organization_id_fkey',
    }).onDelete('cascade'),
  ],
);

export type WebappReminderOccurrenceRow = typeof webappReminderOccurrences.$inferSelect;

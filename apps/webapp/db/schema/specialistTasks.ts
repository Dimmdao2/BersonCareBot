import { boolean, foreignKey, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { beOrganizations } from './bookingEngine';
import { platformUsers } from './schema';

/** Specialist-owned tasks (global or tied to a patient). Not part of treatment program. */
export const specialistTasks = pgTable(
  'specialist_tasks',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id'),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'cascade' }),
    /** null = global task for the specialist */
    patientUserId: uuid('patient_user_id'),
    title: text().notNull(),
    description: text(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'string' }),
    /** false = срок действует до конца календарного дня, без явно выбранного времени */
    dueHasTime: boolean('due_has_time').default(true).notNull(),
    remindAt: timestamp('remind_at', { withTimezone: true, mode: 'string' }),
    isImportant: boolean('is_important').default(false).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_specialist_tasks_organization_id').on(table.organizationId),
    index('idx_specialist_tasks_owner').on(table.ownerUserId),
    index('idx_specialist_tasks_patient').on(table.patientUserId),
    index('idx_specialist_tasks_remind_open').on(table.remindAt),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'specialist_tasks_organization_id_fkey',
    }).onDelete('cascade'),
  ],
);

import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Minimal integrator mapping for the delivery-outcome write port. */
export const specialistTasks = pgTable('specialist_tasks', {
  id: uuid().primaryKey().notNull(),
  reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true, mode: 'string' }),
});

import {
  boolean,
  foreignKey,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { beOrganizations } from './bookingEngine';
import { platformUsers } from './schema';

/** Per-patient support profile (app-wide; not multi-doctor scoped in v1). */
export const doctorPatientSupport = pgTable(
  'doctor_patient_support',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id'),
    patientUserId: uuid('patient_user_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'cascade' }),
    onSupport: boolean('on_support').default(false).notNull(),
    /** Момент начала сопровождения (set when on_support flips to true; null когда не на сопровождении). */
    supportStartedAt: timestamp('support_started_at', { withTimezone: true, mode: 'string' }),
    /** null = use doctor default for patients without support */
    commentsEnabled: boolean('comments_enabled'),
    /** null = use doctor default for patients without support */
    mediaEnabled: boolean('media_enabled'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedBy: uuid('updated_by').references(() => platformUsers.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('idx_doctor_patient_support_organization_id').on(table.organizationId),
    uniqueIndex('uq_doctor_patient_support_patient').on(table.patientUserId),
    index('idx_doctor_patient_support_on_support').on(table.onSupport),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'doctor_patient_support_organization_id_fkey',
    }).onDelete('cascade'),
  ],
);

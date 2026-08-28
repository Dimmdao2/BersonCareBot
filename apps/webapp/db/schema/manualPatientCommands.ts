import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgEnrollments } from './bookingEngine';

export const MANUAL_PATIENT_COMMAND_KINDS = [
  'scheduled',
  'walk_in',
  'standalone_no_contact_card',
] as const;
export type ManualPatientCommandKind = (typeof MANUAL_PATIENT_COMMAND_KINDS)[number];

/** One command namespace for every staff-created manual patient/card write. */
export const manualPatientCommands = pgTable(
  'manual_patient_commands',
  {
    commandId: uuid('command_id').primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    commandKind: text('command_kind').$type<ManualPatientCommandKind>().notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    platformUserId: uuid('platform_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_manual_patient_commands_org_created').using(
      'btree',
      table.organizationId.asc().nullsLast().op('uuid_ops'),
      table.createdAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.organizationId, table.platformUserId],
      foreignColumns: [orgEnrollments.organizationId, orgEnrollments.platformUserId],
      name: 'manual_patient_commands_enrollment_fkey',
    }).onDelete('cascade'),
    index('idx_manual_patient_commands_enrollment').using(
      'btree',
      table.organizationId.asc().nullsLast().op('uuid_ops'),
      table.platformUserId.asc().nullsLast().op('uuid_ops'),
    ),
    check(
      'manual_patient_commands_kind_check',
      sql`${table.commandKind} = ANY (ARRAY['scheduled'::text, 'walk_in'::text, 'standalone_no_contact_card'::text])`,
    ),
    check(
      'manual_patient_commands_fingerprint_check',
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

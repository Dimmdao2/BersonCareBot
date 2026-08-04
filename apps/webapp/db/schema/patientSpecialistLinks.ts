import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index, uniqueIndex, foreignKey, check } from 'drizzle-orm/pg-core';
import { beOrganizations, beSpecialists } from './bookingEngine';
import { platformUsers } from './schema';

/**
 * Access-boundary link, not a clinical relationship: "specialist X may see patient Y as its own
 * in organization Z." Created dormant (VISIBILITY_MODEL_DESIGN_2026-08-04.md §1/§6 stage A) — no
 * reader is wired to it yet.
 */
export const patientSpecialistLinks = pgTable(
  'patient_specialist_links',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    patientUserId: uuid('patient_user_id').notNull(),
    specialistId: uuid('specialist_id').notNull(),
    status: text().notNull().default('active'),
    createdVia: text('created_via').notNull(),
    sourceLinkId: uuid('source_link_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'string' }),
    endedReason: text('ended_reason'),
  },
  (table) => [
    index('idx_patient_specialist_links_org').using(
      'btree',
      table.organizationId.asc().nullsLast().op('uuid_ops'),
    ),
    index('idx_patient_specialist_links_patient').using(
      'btree',
      table.patientUserId.asc().nullsLast().op('uuid_ops'),
    ),
    index('idx_patient_specialist_links_specialist').using(
      'btree',
      table.specialistId.asc().nullsLast().op('uuid_ops'),
    ),
    uniqueIndex('uq_patient_specialist_links_active_pair')
      .on(table.patientUserId, table.specialistId)
      .where(sql`status = 'active'`),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'patient_specialist_links_organization_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: 'patient_specialist_links_patient_user_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.specialistId],
      foreignColumns: [beSpecialists.id],
      name: 'patient_specialist_links_specialist_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.sourceLinkId],
      foreignColumns: [table.id],
      name: 'patient_specialist_links_source_link_id_fkey',
    }).onDelete('set null'),
    check(
      'patient_specialist_links_status_check',
      sql`${table.status} = ANY (ARRAY['active'::text, 'ended'::text])`,
    ),
    check(
      'patient_specialist_links_created_via_check',
      sql`${table.createdVia} = ANY (ARRAY['first_appointment'::text, 'manual_assign'::text, 'transfer'::text])`,
    ),
    check(
      'patient_specialist_links_ended_reason_check',
      sql`${table.endedReason} IS NULL OR ${table.endedReason} = ANY (ARRAY['transferred_out'::text, 'manual_remove'::text])`,
    ),
  ],
);

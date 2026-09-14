import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { beOrganizations } from './bookingEngine';
import { platformUsers } from './schema';

export const leads = pgTable(
  'leads',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    platformUserId: uuid('platform_user_id').notNull(),
    submittedFirstName: text('submitted_first_name'),
    submittedLastName: text('submitted_last_name'),
    submittedPatronymic: text('submitted_patronymic'),
    submittedEmail: text('submitted_email').notNull(),
    submittedPhone: text('submitted_phone'),
    preferredContact: text('preferred_contact'),
    messageText: text('message_text').notNull(),
    status: text().default('new').notNull(),
    rejectionComment: text('rejection_comment'),
    rejectedAt: timestamp('rejected_at', { withTimezone: true, mode: 'string' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'string' }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'string' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
    sourceSurface: text('source_surface').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_leads_org_created').on(table.organizationId, table.createdAt),
    index('idx_leads_org_status_created').on(table.organizationId, table.status, table.createdAt),
    index('idx_leads_user_created').on(table.platformUserId, table.createdAt),
    unique('uq_leads_id_org').on(table.id, table.organizationId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'leads_organization_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.platformUserId],
      foreignColumns: [platformUsers.id],
      name: 'leads_platform_user_id_fkey',
    }).onDelete('restrict'),
    check(
      'leads_status_check',
      sql`${table.status} = ANY (ARRAY['new'::text, 'rejected'::text, 'accepted_in_progress'::text, 'accepted_closed'::text])`,
    ),
    check(
      'leads_source_surface_check',
      sql`${table.sourceSurface} = ANY (ARRAY['public_page'::text, 'widget'::text])`,
    ),
    check('leads_email_not_blank_check', sql`btrim(${table.submittedEmail}) <> ''`),
    check('leads_message_not_blank_check', sql`btrim(${table.messageText}) <> ''`),
  ],
);

export const leadBlocks = pgTable(
  'lead_blocks',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    platformUserId: uuid('platform_user_id').notNull(),
    sourceLeadId: uuid('source_lead_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_lead_blocks_user').on(table.platformUserId),
    unique('uq_lead_blocks_org_user').on(table.organizationId, table.platformUserId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'lead_blocks_organization_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.platformUserId],
      foreignColumns: [platformUsers.id],
      name: 'lead_blocks_platform_user_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.sourceLeadId, table.organizationId],
      foreignColumns: [leads.id, leads.organizationId],
      name: 'lead_blocks_source_lead_id_fkey',
    }).onDelete('restrict'),
  ],
);

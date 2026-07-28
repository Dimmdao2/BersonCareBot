import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { platformUsers } from './schema';
import { beOrganizationMembers, beOrganizations } from './bookingEngine';

export const ORGANIZATION_MEMBER_INVITE_ROLES = ['admin', 'doctor'] as const;
export type OrganizationMemberInviteRole = (typeof ORGANIZATION_MEMBER_INVITE_ROLES)[number];

export const ORGANIZATION_MEMBER_INVITE_STATUSES = [
  'pending',
  'accepted',
  'revoked',
  'expired',
] as const;
export type OrganizationMemberInviteStatus = (typeof ORGANIZATION_MEMBER_INVITE_STATUSES)[number];

export const organizationMemberInvites = pgTable(
  'organization_member_invites',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    invitedEmail: text('invited_email').notNull(),
    invitedRole: text('invited_role').notNull(),
    tokenHash: text('token_hash').notNull(),
    status: text().default('pending').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    createdByPlatformUserId: uuid('created_by_platform_user_id').notNull(),
    acceptedByPlatformUserId: uuid('accepted_by_platform_user_id'),
    acceptedMembershipId: uuid('accepted_membership_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    uniqueIndex('organization_member_invites_token_hash_key').using(
      'btree',
      table.tokenHash.asc().nullsLast().op('text_ops'),
    ),
    uniqueIndex('uq_organization_member_invites_org_email_pending')
      .using(
        'btree',
        table.organizationId.asc().nullsLast().op('uuid_ops'),
        table.invitedEmail.asc().nullsLast().op('text_ops'),
      )
      .where(sql`${table.status} = 'pending'`),
    index('idx_organization_member_invites_org_status').using(
      'btree',
      table.organizationId.asc().nullsLast().op('uuid_ops'),
      table.status.asc().nullsLast().op('text_ops'),
    ),
    index('idx_organization_member_invites_expires_at').using(
      'btree',
      table.expiresAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'organization_member_invites_organization_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.createdByPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: 'organization_member_invites_created_by_fkey',
    }),
    foreignKey({
      columns: [table.acceptedByPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: 'organization_member_invites_accepted_by_fkey',
    }),
    foreignKey({
      columns: [table.acceptedMembershipId],
      foreignColumns: [beOrganizationMembers.id],
      name: 'organization_member_invites_accepted_membership_fkey',
    }).onDelete('set null'),
    check(
      'organization_member_invites_role_check',
      sql`${table.invitedRole} = ANY (ARRAY['admin'::text, 'doctor'::text])`,
    ),
    check(
      'organization_member_invites_status_check',
      sql`${table.status} = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])`,
    ),
  ],
);

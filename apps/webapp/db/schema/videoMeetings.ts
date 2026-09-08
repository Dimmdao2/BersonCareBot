import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { beAppointments, beOrganizations, beSpecialists } from './bookingEngine';
import { platformUsers } from './schema';

export const VIDEO_MEETING_STATUSES = ['active', 'ended', 'revoked'] as const;
export type VideoMeetingStatus = (typeof VIDEO_MEETING_STATUSES)[number];

export const VIDEO_MEETING_INVITE_STATUSES = ['active', 'revoked', 'superseded'] as const;
export type VideoMeetingInviteStatus = (typeof VIDEO_MEETING_INVITE_STATUSES)[number];

/** Provider room references are opaque application identifiers, never a public room URL. */
export const videoMeetings = pgTable(
  'video_meetings',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    patientUserId: uuid('patient_user_id').notNull(),
    specialistId: uuid('specialist_id').notNull(),
    appointmentId: uuid('appointment_id'),
    providerRoomRef: text('provider_room_ref').notNull(),
    status: text().notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'string' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_video_meetings_active_participants')
      .on(table.organizationId, table.patientUserId, table.specialistId)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex('uq_video_meetings_provider_room_ref').on(table.providerRoomRef),
    index('idx_video_meetings_org_patient_created').on(table.organizationId, table.patientUserId, table.createdAt),
    index('idx_video_meetings_org_specialist_created').on(table.organizationId, table.specialistId, table.createdAt),
    foreignKey({ columns: [table.organizationId], foreignColumns: [beOrganizations.id], name: 'video_meetings_organization_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.patientUserId], foreignColumns: [platformUsers.id], name: 'video_meetings_patient_user_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.specialistId], foreignColumns: [beSpecialists.id], name: 'video_meetings_specialist_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.appointmentId], foreignColumns: [beAppointments.id], name: 'video_meetings_appointment_id_fkey' }).onDelete('set null'),
    check('video_meetings_status_check', sql`${table.status} = ANY (ARRAY['active'::text, 'ended'::text, 'revoked'::text])`),
  ],
);

/** Only a one-way hash of the fragment bearer is persisted. */
export const videoMeetingInvites = pgTable(
  'video_meeting_invites',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    meetingId: uuid('meeting_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    secretHash: text('secret_hash').notNull(),
    status: text().notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    revokedByPlatformUserId: uuid('revoked_by_platform_user_id'),
    supersededByInviteId: uuid('superseded_by_invite_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_video_meeting_invites_secret_hash').on(table.secretHash),
    uniqueIndex('uq_video_meeting_invites_active_meeting').on(table.meetingId).where(sql`${table.status} = 'active'`),
    index('idx_video_meeting_invites_org_status_expires').on(table.organizationId, table.status, table.expiresAt),
    foreignKey({ columns: [table.meetingId], foreignColumns: [videoMeetings.id], name: 'video_meeting_invites_meeting_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.organizationId], foreignColumns: [beOrganizations.id], name: 'video_meeting_invites_organization_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.revokedByPlatformUserId], foreignColumns: [platformUsers.id], name: 'video_meeting_invites_revoked_by_fkey' }),
    foreignKey({ columns: [table.supersededByInviteId], foreignColumns: [table.id], name: 'video_meeting_invites_superseded_by_fkey' }).onDelete('set null'),
    check('video_meeting_invites_status_check', sql`${table.status} = ANY (ARRAY['active'::text, 'revoked'::text, 'superseded'::text])`),
  ],
);

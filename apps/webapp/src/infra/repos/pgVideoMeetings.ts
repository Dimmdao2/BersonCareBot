import { and, eq, gt, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { videoMeetingInvites, videoMeetings } from '../../../db/schema/videoMeetings';
import type { VideoMeetingRecord, VideoMeetingStore } from '@/modules/video-meetings/ports';

function mapMeeting(row: typeof videoMeetings.$inferSelect): VideoMeetingRecord {
  return { id: row.id, organizationId: row.organizationId, patientUserId: row.patientUserId, specialistId: row.specialistId, providerRoomRef: row.providerRoomRef, status: row.status as VideoMeetingRecord['status'], expiresAt: row.expiresAt };
}

export function createPgVideoMeetingStore(): VideoMeetingStore {
  return {
    async findOrCreateActive(input) {
      const db = getDrizzle();
      const findOrCreate = () => db.transaction(async (tx) => {
        const [current] = await tx.select().from(videoMeetings).where(and(
          eq(videoMeetings.organizationId, input.organizationId),
          eq(videoMeetings.patientUserId, input.patientUserId),
          eq(videoMeetings.specialistId, input.specialistId),
          eq(videoMeetings.status, 'active'),
        )).for('update').limit(1);
        const now = new Date().toISOString();
        if (current && Date.parse(current.expiresAt) > Date.parse(now)) {
          return { meeting: mapMeeting(current), created: false };
        }
        if (current) {
          await tx.update(videoMeetings).set({ status: 'ended', endedAt: now, updatedAt: now })
            .where(eq(videoMeetings.id, current.id));
        }
        const [created] = await tx.insert(videoMeetings).values(input).returning();
        if (!created) throw new Error('video_meeting_insert_failed');
        return { meeting: mapMeeting(created), created: true };
      });
      try {
        return await findOrCreate();
      } catch (error) {
        const [raced] = await db.select().from(videoMeetings).where(and(
          eq(videoMeetings.organizationId, input.organizationId),
          eq(videoMeetings.patientUserId, input.patientUserId),
          eq(videoMeetings.specialistId, input.specialistId),
          eq(videoMeetings.status, 'active'),
          gt(videoMeetings.expiresAt, new Date().toISOString()),
        )).limit(1);
        if (raced) return { meeting: mapMeeting(raced), created: false };
        throw error;
      }
    },
    async rotateInvite(input) {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const [meeting] = await tx.select({ id: videoMeetings.id }).from(videoMeetings).where(and(
          eq(videoMeetings.id, input.meetingId), eq(videoMeetings.organizationId, input.organizationId),
          eq(videoMeetings.specialistId, input.specialistId), eq(videoMeetings.status, 'active'),
          gt(videoMeetings.expiresAt, new Date().toISOString()),
        )).for('update').limit(1);
        if (!meeting) return false;
        const now = new Date().toISOString();
        await tx.update(videoMeetingInvites).set({ status: 'superseded', updatedAt: now }).where(and(eq(videoMeetingInvites.meetingId, input.meetingId), eq(videoMeetingInvites.status, 'active')));
        await tx.insert(videoMeetingInvites).values({
          id: input.id,
          meetingId: input.meetingId,
          organizationId: input.organizationId,
          secretHash: input.secretHash,
          expiresAt: input.expiresAt,
        });
        return true;
      });
    },
    async revokeInvite(input) {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const [meeting] = await tx.select({ id: videoMeetings.id }).from(videoMeetings).where(and(
          eq(videoMeetings.id, input.meetingId), eq(videoMeetings.organizationId, input.organizationId),
          eq(videoMeetings.specialistId, input.specialistId), eq(videoMeetings.status, 'active'),
          gt(videoMeetings.expiresAt, new Date().toISOString()),
        )).for('update').limit(1);
        if (!meeting) return false;
        const now = new Date().toISOString();
        const result = await tx.update(videoMeetingInvites).set({ status: 'revoked', revokedAt: now, revokedByPlatformUserId: input.actorPlatformUserId, updatedAt: now }).where(and(eq(videoMeetingInvites.meetingId, input.meetingId), eq(videoMeetingInvites.organizationId, input.organizationId), eq(videoMeetingInvites.status, 'active'))).returning({ id: videoMeetingInvites.id });
        return result.length > 0;
      });
    },
    async endMeeting(input) {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const [meeting] = await tx.select({ id: videoMeetings.id }).from(videoMeetings).where(and(
          eq(videoMeetings.id, input.meetingId), eq(videoMeetings.organizationId, input.organizationId),
          eq(videoMeetings.specialistId, input.specialistId), eq(videoMeetings.status, 'active'),
        )).for('update').limit(1);
        if (!meeting) return false;
        const now = new Date().toISOString();
        await tx.update(videoMeetings).set({ status: 'ended', endedAt: now, updatedAt: now }).where(eq(videoMeetings.id, input.meetingId));
        await tx.update(videoMeetingInvites).set({ status: 'revoked', revokedAt: now, revokedByPlatformUserId: input.actorPlatformUserId, updatedAt: now }).where(and(eq(videoMeetingInvites.meetingId, input.meetingId), eq(videoMeetingInvites.status, 'active')));
        return true;
      });
    },
    async findGuestMeeting(secretHash) {
      const result = await getDrizzle().execute<typeof videoMeetings.$inferSelect>(sql`
        SELECT id, organization_id AS "organizationId", patient_user_id AS "patientUserId",
               specialist_id AS "specialistId", provider_room_ref AS "providerRoomRef", status,
               expires_at AS "expiresAt"
        FROM app.exchange_video_meeting_invite(${secretHash})
      `);
      const row = result.rows[0];
      return row ? mapMeeting(row) : null;
    },
    async findPatientMeeting(input) {
      const now = new Date().toISOString();
      const [row] = await getDrizzle().select().from(videoMeetings).where(and(eq(videoMeetings.id, input.meetingId), eq(videoMeetings.organizationId, input.organizationId), eq(videoMeetings.patientUserId, input.patientUserId), eq(videoMeetings.status, 'active'), gt(videoMeetings.expiresAt, now))).limit(1);
      return row ? mapMeeting(row) : null;
    },
  };
}

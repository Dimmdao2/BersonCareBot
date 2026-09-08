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
      const existing = async () => db.select().from(videoMeetings).where(and(eq(videoMeetings.organizationId, input.organizationId), eq(videoMeetings.patientUserId, input.patientUserId), eq(videoMeetings.specialistId, input.specialistId), eq(videoMeetings.status, 'active'))).limit(1);
      const [current] = await existing();
      if (current) return { meeting: mapMeeting(current), created: false };
      try {
        const [created] = await db.insert(videoMeetings).values(input).returning();
        if (!created) throw new Error('video_meeting_insert_failed');
        return { meeting: mapMeeting(created), created: true };
      } catch (error) {
        const [raced] = await existing();
        if (raced) return { meeting: mapMeeting(raced), created: false };
        throw error;
      }
    },
    async rotateInvite(input) {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const [meeting] = await tx.select({ id: videoMeetings.id }).from(videoMeetings).where(and(eq(videoMeetings.id, input.meetingId), eq(videoMeetings.organizationId, input.organizationId), eq(videoMeetings.status, 'active'))).for('update').limit(1);
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
      const result = await getDrizzle().update(videoMeetingInvites).set({ status: 'revoked', revokedAt: new Date().toISOString(), revokedByPlatformUserId: input.actorPlatformUserId, updatedAt: new Date().toISOString() }).where(and(eq(videoMeetingInvites.meetingId, input.meetingId), eq(videoMeetingInvites.organizationId, input.organizationId), eq(videoMeetingInvites.status, 'active'))).returning({ id: videoMeetingInvites.id });
      return result.length > 0;
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

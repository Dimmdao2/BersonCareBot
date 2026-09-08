import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { doctorNotes } from '../../../db/schema/schema';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { getWebappSqlDb } from '@/infra/db/runWebappSql';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import type { DoctorNoteRow, DoctorNotesPort } from '@/modules/doctor-notes/ports';

function mapRow(row: typeof doctorNotes.$inferSelect): DoctorNoteRow {
  return {
    id: row.id,
    organizationId: row.organizationId ?? null,
    userId: row.userId,
    authorId: row.authorId,
    noteDate: row.noteDate,
    text: row.text,
    revision: row.revision,
    createdAt: toIsoStringSafe(row.createdAt),
    updatedAt: toIsoStringSafe(row.updatedAt),
  };
}

function currentWriteOrganizationId(): string | null {
  return getCurrentDbPrincipalOrganizationId() ?? null;
}

function dailyNoteWhere(params: {
  organizationId: string | null;
  userId: string;
  authorId: string;
  noteDate: string;
}) {
  return and(
    params.organizationId
      ? eq(doctorNotes.organizationId, params.organizationId)
      : isNull(doctorNotes.organizationId),
    eq(doctorNotes.userId, params.userId),
    eq(doctorNotes.authorId, params.authorId),
    eq(doctorNotes.noteDate, params.noteDate),
  );
}

export function createPgDoctorNotesPort(): DoctorNotesPort {
  return {
    async listForUser(userId: string, authorId: string): Promise<DoctorNoteRow[]> {
      const organizationId = getCurrentDbPrincipalOrganizationId();
      const rows = await getWebappSqlDb()
        .select()
        .from(doctorNotes)
        .where(
          and(
            eq(doctorNotes.userId, userId),
            eq(doctorNotes.authorId, authorId),
            organizationId ? eq(doctorNotes.organizationId, organizationId) : undefined,
          ),
        )
        .orderBy(desc(doctorNotes.noteDate));
      return rows.map(mapRow);
    },

    async saveDaily(params: {
      userId: string;
      authorId: string;
      noteDate: string;
      text: string;
      expectedRevision?: number;
    }) {
      return runDrizzleMutationTransaction(async (tx) => {
        const organizationId = currentWriteOrganizationId();
        const where = dailyNoteWhere({ ...params, organizationId });
        const [existing] = await tx.select().from(doctorNotes).where(where).limit(1);

        if (!existing && params.expectedRevision === undefined) {
          const [inserted] = await tx
            .insert(doctorNotes)
            .values({
              organizationId,
              userId: params.userId,
              authorId: params.authorId,
              noteDate: params.noteDate,
              text: params.text,
            })
            .onConflictDoNothing({
              target: [
                doctorNotes.organizationId,
                doctorNotes.userId,
                doctorNotes.authorId,
                doctorNotes.noteDate,
              ],
            })
            .returning();
          if (inserted) return { kind: 'saved' as const, note: mapRow(inserted) };
        }

        const [current] = existing
          ? [existing]
          : await tx.select().from(doctorNotes).where(where).limit(1);
        if (!current || params.expectedRevision !== current.revision) {
          if (!current) throw new Error('doctor_notes daily upsert failed');
          return { kind: 'conflict' as const, note: mapRow(current) };
        }

        const [updated] = await tx
          .update(doctorNotes)
          .set({
            text: params.text,
            updatedAt: new Date().toISOString(),
            revision: current.revision + 1,
          })
          .where(and(eq(doctorNotes.id, current.id), eq(doctorNotes.revision, current.revision)))
          .returning();
        if (!updated) {
          const [latest] = await tx.select().from(doctorNotes).where(where).limit(1);
          if (!latest) throw new Error('doctor_notes daily update failed');
          return { kind: 'conflict' as const, note: mapRow(latest) };
        }
        return { kind: 'saved' as const, note: mapRow(updated) };
      });
    },
  };
}

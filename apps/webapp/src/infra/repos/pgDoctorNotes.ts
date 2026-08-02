import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { and, desc, eq } from 'drizzle-orm';
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
    text: row.text,
    createdAt: toIsoStringSafe(row.createdAt),
    updatedAt: toIsoStringSafe(row.updatedAt),
  };
}

function currentWriteOrganizationId(): string | null {
  return getCurrentDbPrincipalOrganizationId() ?? null;
}

export function createPgDoctorNotesPort(): DoctorNotesPort {
  return {
    async listForUser(userId: string): Promise<DoctorNoteRow[]> {
      const organizationId = getCurrentDbPrincipalOrganizationId();
      const rows = await getWebappSqlDb()
        .select()
        .from(doctorNotes)
        .where(
          and(
            eq(doctorNotes.userId, userId),
            organizationId ? eq(doctorNotes.organizationId, organizationId) : undefined,
          ),
        )
        .orderBy(desc(doctorNotes.createdAt));
      return rows.map(mapRow);
    },

    async create(params: {
      userId: string;
      authorId: string;
      text: string;
    }): Promise<DoctorNoteRow> {
      return runDrizzleMutationTransaction(async (tx) => {
        const [row] = await tx
          .insert(doctorNotes)
          .values({
            organizationId: currentWriteOrganizationId(),
            userId: params.userId,
            authorId: params.authorId,
            text: params.text,
          })
          .returning();
        if (!row) throw new Error('doctor_notes insert failed');
        return mapRow(row);
      });
    },
  };
}

import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { doctorNotes } from '../../../db/schema/schema';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { runWebappPgText } from '@/infra/db/runWebappSql';
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
      const r = await runWebappPgText<{
        id: string;
        organization_id: string | null;
        user_id: string;
        author_id: string;
        text: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, organization_id, user_id, author_id, text, created_at, updated_at
         FROM doctor_notes
         WHERE user_id = $1
           AND ($2::uuid IS NULL OR organization_id = $2::uuid)
         ORDER BY created_at DESC`,
        [userId, getCurrentDbPrincipalOrganizationId()],
      );
      return r.rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        userId: row.user_id,
        authorId: row.author_id,
        text: row.text,
        createdAt: toIsoStringSafe(row.created_at),
        updatedAt: toIsoStringSafe(row.updated_at),
      }));
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

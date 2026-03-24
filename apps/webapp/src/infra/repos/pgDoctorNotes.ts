import { getPool } from "@/infra/db/client";
import type { DoctorNoteRow, DoctorNotesPort } from "@/modules/doctor-notes/ports";

export function createPgDoctorNotesPort(): DoctorNotesPort {
  return {
    async listForUser(userId: string): Promise<DoctorNoteRow[]> {
      const pool = getPool();
      const r = await pool.query<{
        id: string;
        user_id: string;
        author_id: string;
        text: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, user_id, author_id, text, created_at, updated_at
         FROM doctor_notes WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      return r.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        authorId: row.author_id,
        text: row.text,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }));
    },

    async create(params: { userId: string; authorId: string; text: string }): Promise<DoctorNoteRow> {
      const pool = getPool();
      const r = await pool.query<{
        id: string;
        user_id: string;
        author_id: string;
        text: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO doctor_notes (user_id, author_id, text)
         VALUES ($1, $2, $3)
         RETURNING id, user_id, author_id, text, created_at, updated_at`,
        [params.userId, params.authorId, params.text]
      );
      const row = r.rows[0]!;
      return {
        id: row.id,
        userId: row.user_id,
        authorId: row.author_id,
        text: row.text,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    },
  };
}

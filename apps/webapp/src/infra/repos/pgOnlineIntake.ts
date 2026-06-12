import { randomUUID } from "node:crypto";
import { toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import type { PoolClient } from "pg";
/**
 * Wave 3 phase 12A — Class C transport only: `client.query("BEGIN"|"COMMIT"|"ROLLBACK")` for multipart tx
 * with shared advisory lock per user id. Domain SQL — `runWebappPgText` / `getWebappSqlFromPgClient`.
 * Wave 3 phase 15G — getDoctorStats migrated from pool.query to Drizzle db.execute(sql).
 */
import { sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import { pgAdvisoryXactLockShared } from "@/infra/db/pgAdvisoryLock";
import { getWebappSqlFromPgClient, runWebappPgText } from "@/infra/db/runWebappSql";
import { resolveMediaFileForLfkAttachment } from "@/infra/repos/pgMediaFileIntakeResolve";
import type { OnlineIntakePort, ListIntakeQuery } from "@/modules/online-intake/ports";
import type {
  ChangeIntakeStatusInput,
  CreateLfkIntakeInput,
  CreateNutritionIntakeInput,
  IntakeAnswer,
  IntakeAttachment,
  IntakeDoctorStats,
  IntakeRequest,
  IntakeRequestFull,
  IntakeRequestFullWithPatientIdentity,
  IntakeRequestWithPatientIdentity,
  IntakeStatus,
  IntakeStatusHistoryEntry,
  IntakeType,
} from "@/modules/online-intake/types";

type RequestRow = {
  id: string;
  user_id: string;
  type: string;
  status: string;
  summary: string | null;
  created_at: Date;
  updated_at: Date;
};

type AnswerRow = {
  id: string;
  request_id: string;
  question_id: string;
  ordinal: number;
  value: string;
  created_at: Date;
};

type AttachmentRow = {
  id: string;
  request_id: string;
  attachment_type: string;
  s3_key: string | null;
  url: string | null;
  mime_type: string | null;
  size_bytes: string | null;
  original_name: string | null;
  created_at: Date;
};

type HistoryRow = {
  id: string;
  request_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  note: string | null;
  changed_at: Date;
};

type RequestRowWithIdentity = RequestRow & {
  patient_name: string;
  patient_phone: string;
};

function mapRequestWithPatientIdentity(row: RequestRowWithIdentity): IntakeRequestWithPatientIdentity {
  return {
    ...mapRequest(row),
    patientName: row.patient_name,
    patientPhone: row.patient_phone,
  };
}

function mapRequest(row: RequestRow): IntakeRequest {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as IntakeType,
    status: row.status as IntakeStatus,
    summary: row.summary,
    createdAt: toIsoStringSafe(row.created_at),
    updatedAt: toIsoStringSafe(row.updated_at),
  };
}

function mapAnswer(row: AnswerRow): IntakeAnswer {
  return {
    id: row.id,
    requestId: row.request_id,
    questionId: row.question_id,
    ordinal: row.ordinal,
    value: row.value,
    createdAt: toIsoStringSafe(row.created_at),
  };
}

function mapAttachment(row: AttachmentRow): IntakeAttachment {
  return {
    id: row.id,
    requestId: row.request_id,
    attachmentType: row.attachment_type as "file" | "url",
    s3Key: row.s3_key,
    url: row.url,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes !== null ? Number(row.size_bytes) : null,
    originalName: row.original_name,
    createdAt: toIsoStringSafe(row.created_at),
  };
}

function mapHistory(row: HistoryRow): IntakeStatusHistoryEntry {
  return {
    id: row.id,
    requestId: row.request_id,
    fromStatus: (row.from_status as IntakeStatus | null) ?? null,
    toStatus: row.to_status as IntakeStatus,
    changedBy: row.changed_by,
    note: row.note,
    changedAt: toIsoStringSafe(row.changed_at),
  };
}

async function runIntakePgText<T>(
  client: PoolClient,
  queryText: string,
  values: readonly unknown[] = [],
) {
  return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
}

export function createPgOnlineIntakePort(): OnlineIntakePort {
  return {
    async createLfkRequest(input: CreateLfkIntakeInput): Promise<IntakeRequest> {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await pgAdvisoryXactLockShared(client, input.userId);
        const id = randomUUID();
        const summary = input.description.slice(0, 200);

        const { rows } = await runIntakePgText<RequestRow>(
          client,
          `INSERT INTO online_intake_requests (id, user_id, type, summary)
           VALUES ($1, $2, 'lfk', $3)
           RETURNING *`,
          [id, input.userId, summary],
        );
        const request = mapRequest(rows[0]);

        await runIntakePgText(
          client,
          `INSERT INTO online_intake_answers (id, request_id, question_id, ordinal, value)
           VALUES ($1, $2, 'lfk_description', 1, $3)`,
          [randomUUID(), id, input.description],
        );

        for (const url of input.attachmentUrls ?? []) {
          await runIntakePgText(
            client,
            `INSERT INTO online_intake_attachments (id, request_id, attachment_type, url)
             VALUES ($1, $2, 'url', $3)`,
            [randomUUID(), id, url],
          );
        }

        for (const fileId of input.attachmentFileIds ?? []) {
          const resolved = await resolveMediaFileForLfkAttachment(client, fileId, input.userId);
          await runIntakePgText(
            client,
            `INSERT INTO online_intake_attachments
               (id, request_id, attachment_type, s3_key, mime_type, size_bytes, original_name)
             VALUES ($1, $2, 'file', $3, $4, $5, $6)`,
            [
              randomUUID(),
              id,
              resolved.s3Key,
              resolved.mimeType,
              resolved.sizeBytes,
              resolved.originalName,
            ],
          );
        }

        await runIntakePgText(
          client,
          `INSERT INTO online_intake_status_history (id, request_id, from_status, to_status)
           VALUES ($1, $2, NULL, 'new')`,
          [randomUUID(), id],
        );

        await client.query("COMMIT");
        return request;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },

    async createNutritionRequest(input: CreateNutritionIntakeInput): Promise<IntakeRequest> {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await pgAdvisoryXactLockShared(client, input.userId);
        const id = randomUUID();
        const summary = input.description.slice(0, 200);

        const { rows } = await runIntakePgText<RequestRow>(
          client,
          `INSERT INTO online_intake_requests (id, user_id, type, summary)
           VALUES ($1, $2, 'nutrition', $3)
           RETURNING *`,
          [id, input.userId, summary],
        );
        const request = mapRequest(rows[0]);

        await runIntakePgText(
          client,
          `INSERT INTO online_intake_answers (id, request_id, question_id, ordinal, value)
           VALUES ($1, $2, 'nutrition_description', 1, $3)`,
          [randomUUID(), id, input.description],
        );

        await runIntakePgText(
          client,
          `INSERT INTO online_intake_status_history (id, request_id, from_status, to_status)
           VALUES ($1, $2, NULL, 'new')`,
          [randomUUID(), id],
        );

        await client.query("COMMIT");
        return request;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },

    async getById(id: string): Promise<IntakeRequestFull | null> {
      const { rows: reqRows } = await runWebappPgText<RequestRow>(
        `SELECT * FROM online_intake_requests WHERE id = $1`,
        [id],
      );
      if (!reqRows[0]) return null;
      const request = mapRequest(reqRows[0]);

      const { rows: ansRows } = await runWebappPgText<AnswerRow>(
        `SELECT * FROM online_intake_answers WHERE request_id = $1 ORDER BY ordinal`,
        [id],
      );
      const { rows: attRows } = await runWebappPgText<AttachmentRow>(
        `SELECT * FROM online_intake_attachments WHERE request_id = $1 ORDER BY created_at`,
        [id],
      );
      const { rows: histRows } = await runWebappPgText<HistoryRow>(
        `SELECT * FROM online_intake_status_history WHERE request_id = $1 ORDER BY changed_at`,
        [id],
      );

      return {
        ...request,
        answers: ansRows.map(mapAnswer),
        attachments: attRows.map(mapAttachment),
        statusHistory: histRows.map(mapHistory),
      };
    },

    async getByIdForDoctor(id: string): Promise<IntakeRequestFullWithPatientIdentity | null> {
      const { rows: reqRows } = await runWebappPgText<RequestRowWithIdentity>(
        `SELECT r.*, COALESCE(pu.display_name, '') AS patient_name, COALESCE(pu.phone_normalized, '') AS patient_phone
         FROM online_intake_requests r
         LEFT JOIN platform_users pu ON pu.id = r.user_id
         WHERE r.id = $1`,
        [id],
      );
      if (!reqRows[0]) return null;
      const reqRow = reqRows[0];
      const request = mapRequest(reqRow);
      const patientName = reqRow.patient_name;
      const patientPhone = reqRow.patient_phone;

      const { rows: ansRows } = await runWebappPgText<AnswerRow>(
        `SELECT * FROM online_intake_answers WHERE request_id = $1 ORDER BY ordinal`,
        [id],
      );
      const { rows: attRows } = await runWebappPgText<AttachmentRow>(
        `SELECT * FROM online_intake_attachments WHERE request_id = $1 ORDER BY created_at`,
        [id],
      );
      const { rows: histRows } = await runWebappPgText<HistoryRow>(
        `SELECT * FROM online_intake_status_history WHERE request_id = $1 ORDER BY changed_at`,
        [id],
      );

      return {
        ...request,
        patientName,
        patientPhone,
        answers: ansRows.map(mapAnswer),
        attachments: attRows.map(mapAttachment),
        statusHistory: histRows.map(mapHistory),
      };
    },

    async listRequests(query: ListIntakeQuery): Promise<{ items: IntakeRequest[]; total: number }> {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (query.userId) {
        conditions.push(`user_id = $${idx++}`);
        params.push(query.userId);
      }
      if (query.type) {
        conditions.push(`type = $${idx++}`);
        params.push(query.type);
      }
      if (query.status) {
        conditions.push(`status = $${idx++}`);
        params.push(query.status);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = query.limit ?? 20;
      const offset = query.offset ?? 0;

      const { rows: countRows } = await runWebappPgText<{ count: string }>(
        `SELECT count(*)::text AS count FROM online_intake_requests ${where}`,
        params,
      );
      const total = parseInt(countRows[0].count, 10);

      const { rows } = await runWebappPgText<RequestRow>(
        `SELECT * FROM online_intake_requests ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset],
      );

      return { items: rows.map(mapRequest), total };
    },

    async listRequestsForDoctor(
      query: ListIntakeQuery,
    ): Promise<{ items: IntakeRequestWithPatientIdentity[]; total: number }> {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (query.userId) {
        conditions.push(`r.user_id = $${idx++}`);
        params.push(query.userId);
      }
      if (query.type) {
        conditions.push(`r.type = $${idx++}`);
        params.push(query.type);
      }
      if (query.open) {
        conditions.push(`r.status <> 'closed'`);
      } else if (query.status) {
        conditions.push(`r.status = $${idx++}`);
        params.push(query.status);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = query.limit ?? 20;
      const offset = query.offset ?? 0;

      const { rows: countRows } = await runWebappPgText<{ count: string }>(
        `SELECT count(*)::text AS count FROM online_intake_requests r ${where}`,
        params,
      );
      const total = parseInt(countRows[0].count, 10);

      const { rows } = await runWebappPgText<RequestRowWithIdentity>(
        `SELECT r.*, COALESCE(pu.display_name, '') AS patient_name, COALESCE(pu.phone_normalized, '') AS patient_phone
         FROM online_intake_requests r
         LEFT JOIN platform_users pu ON pu.id = r.user_id
         ${where}
         ORDER BY r.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset],
      );

      return { items: rows.map(mapRequestWithPatientIdentity), total };
    },

    async countActiveByUser(userId: string, type: IntakeType): Promise<number> {
      const { rows } = await runWebappPgText<{ count: string }>(
        `SELECT count(*)::text AS count FROM online_intake_requests
         WHERE user_id = $1 AND type = $2 AND status IN ('new','in_review','contacted')`,
        [userId, type],
      );
      return parseInt(rows[0].count, 10);
    },

    async changeStatus(input: ChangeIntakeStatusInput): Promise<IntakeRequest> {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const { rows: cur } = await runIntakePgText<RequestRow>(
          client,
          `SELECT * FROM online_intake_requests WHERE id = $1 FOR UPDATE`,
          [input.requestId],
        );
        if (!cur[0]) throw Object.assign(new Error("not_found"), { code: "NOT_FOUND" });

        const fromStatus = cur[0].status;

        const { rows } = await runIntakePgText<RequestRow>(
          client,
          `UPDATE online_intake_requests
           SET status = $1, updated_at = now()
           WHERE id = $2
           RETURNING *`,
          [input.toStatus, input.requestId],
        );

        await runIntakePgText(
          client,
          `INSERT INTO online_intake_status_history
             (id, request_id, from_status, to_status, changed_by, note)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            input.requestId,
            fromStatus,
            input.toStatus,
            input.changedBy ?? null,
            input.note ?? null,
          ],
        );

        await client.query("COMMIT");
        return mapRequest(rows[0]);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },

    async getDoctorStats(days: number): Promise<IntakeDoctorStats> {
      const db = getDrizzle();
      const result = await db.execute<{ status: string; cnt: string }>(sql`
        SELECT status, COUNT(*) AS cnt
        FROM online_intake_requests
        WHERE created_at >= NOW() - (${String(days)} || ' days')::interval
        GROUP BY status
      `);
      const rows = result.rows as { status: string; cnt: string }[];

      const byStatus: Record<string, number> = {};
      let total = 0;
      for (const row of rows) {
        const count = parseInt(row.cnt, 10);
        byStatus[row.status] = count;
        total += count;
      }

      const booked = byStatus["booked"] ?? 0;
      const rejected = byStatus["rejected"] ?? 0;
      const denominator = booked + rejected;
      const conversionRate = denominator > 0 ? booked / denominator : null;

      return {
        days,
        total,
        byStatus: byStatus as Record<IntakeStatus, number>,
        conversionRate,
      };
    },
  };
}

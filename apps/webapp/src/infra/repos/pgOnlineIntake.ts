import { randomUUID } from "node:crypto";
import { getPool } from "@/infra/db/client";
import { resolveMediaFileForLfkAttachment } from "@/infra/repos/pgMediaFileIntakeResolve";
import type { OnlineIntakePort, ListIntakeQuery } from "@/modules/online-intake/ports";
import type {
  ChangeIntakeStatusInput,
  CreateLfkIntakeInput,
  CreateNutritionIntakeInput,
  IntakeAnswer,
  IntakeAttachment,
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
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapAnswer(row: AnswerRow): IntakeAnswer {
  return {
    id: row.id,
    requestId: row.request_id,
    questionId: row.question_id,
    ordinal: row.ordinal,
    value: row.value,
    createdAt: row.created_at.toISOString(),
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
    createdAt: row.created_at.toISOString(),
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
    changedAt: row.changed_at.toISOString(),
  };
}

export function createPgOnlineIntakePort(): OnlineIntakePort {
  return {
    async createLfkRequest(input: CreateLfkIntakeInput): Promise<IntakeRequest> {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SELECT pg_advisory_xact_lock_shared(hashtext($1::text))`, [input.userId]);
        const id = randomUUID();
        const summary = input.description.slice(0, 200);

        const { rows } = await client.query<RequestRow>(
          `INSERT INTO online_intake_requests (id, user_id, type, summary)
           VALUES ($1, $2, 'lfk', $3)
           RETURNING *`,
          [id, input.userId, summary],
        );
        const request = mapRequest(rows[0]);

        await client.query(
          `INSERT INTO online_intake_answers (id, request_id, question_id, ordinal, value)
           VALUES ($1, $2, 'lfk_description', 1, $3)`,
          [randomUUID(), id, input.description],
        );

        for (const url of input.attachmentUrls ?? []) {
          await client.query(
            `INSERT INTO online_intake_attachments (id, request_id, attachment_type, url)
             VALUES ($1, $2, 'url', $3)`,
            [randomUUID(), id, url],
          );
        }

        for (const fileId of input.attachmentFileIds ?? []) {
          const resolved = await resolveMediaFileForLfkAttachment(client, fileId, input.userId);
          await client.query(
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

        await client.query(
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
        await client.query(`SELECT pg_advisory_xact_lock_shared(hashtext($1::text))`, [input.userId]);
        const id = randomUUID();
        const summary = input.description.slice(0, 200);

        const { rows } = await client.query<RequestRow>(
          `INSERT INTO online_intake_requests (id, user_id, type, summary)
           VALUES ($1, $2, 'nutrition', $3)
           RETURNING *`,
          [id, input.userId, summary],
        );
        const request = mapRequest(rows[0]);

        await client.query(
          `INSERT INTO online_intake_answers (id, request_id, question_id, ordinal, value)
           VALUES ($1, $2, 'nutrition_description', 1, $3)`,
          [randomUUID(), id, input.description],
        );

        await client.query(
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
      const pool = getPool();
      const { rows: reqRows } = await pool.query<RequestRow>(
        `SELECT * FROM online_intake_requests WHERE id = $1`,
        [id],
      );
      if (!reqRows[0]) return null;
      const request = mapRequest(reqRows[0]);

      const { rows: ansRows } = await pool.query<AnswerRow>(
        `SELECT * FROM online_intake_answers WHERE request_id = $1 ORDER BY ordinal`,
        [id],
      );
      const { rows: attRows } = await pool.query<AttachmentRow>(
        `SELECT * FROM online_intake_attachments WHERE request_id = $1 ORDER BY created_at`,
        [id],
      );
      const { rows: histRows } = await pool.query<HistoryRow>(
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
      const pool = getPool();
      const { rows: reqRows } = await pool.query<RequestRowWithIdentity>(
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

      const { rows: ansRows } = await pool.query<AnswerRow>(
        `SELECT * FROM online_intake_answers WHERE request_id = $1 ORDER BY ordinal`,
        [id],
      );
      const { rows: attRows } = await pool.query<AttachmentRow>(
        `SELECT * FROM online_intake_attachments WHERE request_id = $1 ORDER BY created_at`,
        [id],
      );
      const { rows: histRows } = await pool.query<HistoryRow>(
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
      const pool = getPool();
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

      const { rows: countRows } = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM online_intake_requests ${where}`,
        params,
      );
      const total = parseInt(countRows[0].count, 10);

      const { rows } = await pool.query<RequestRow>(
        `SELECT * FROM online_intake_requests ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset],
      );

      return { items: rows.map(mapRequest), total };
    },

    async listRequestsForDoctor(
      query: ListIntakeQuery,
    ): Promise<{ items: IntakeRequestWithPatientIdentity[]; total: number }> {
      const pool = getPool();
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
      if (query.status) {
        conditions.push(`r.status = $${idx++}`);
        params.push(query.status);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = query.limit ?? 20;
      const offset = query.offset ?? 0;

      const { rows: countRows } = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM online_intake_requests r ${where}`,
        params,
      );
      const total = parseInt(countRows[0].count, 10);

      const { rows } = await pool.query<RequestRowWithIdentity>(
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
      const pool = getPool();
      const { rows } = await pool.query<{ count: string }>(
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

        const { rows: cur } = await client.query<RequestRow>(
          `SELECT * FROM online_intake_requests WHERE id = $1 FOR UPDATE`,
          [input.requestId],
        );
        if (!cur[0]) throw Object.assign(new Error("not_found"), { code: "NOT_FOUND" });

        const fromStatus = cur[0].status;

        const { rows } = await client.query<RequestRow>(
          `UPDATE online_intake_requests
           SET status = $1, updated_at = now()
           WHERE id = $2
           RETURNING *`,
          [input.toStatus, input.requestId],
        );

        await client.query(
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
  };
}

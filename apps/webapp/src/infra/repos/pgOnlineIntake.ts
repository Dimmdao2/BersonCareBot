import { randomUUID } from "node:crypto";
import { toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import type { PoolClient } from "pg";
/**
 * Wave 3 phase 12A + R0/S3P — multipart tx with shared advisory lock per user id.
 * Checkout/tx control goes through `withPoolTransaction`.
 * Domain SQL — `runWebappPgText` / `getWebappSqlFromPgClient`.
 * Wave 3 phase 15G — getDoctorStats migrated from pool.query to Drizzle db.execute(sql).
 */
import { sql } from "drizzle-orm";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import { pgAdvisoryXactLockShared } from "@/infra/db/pgAdvisoryLock";
import { getWebappSqlFromPgClient, runWebappPgText } from "@/infra/db/runWebappSql";
import { withPoolTransaction } from "@/infra/db/withClient";
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
  organization_id: string | null;
  type: string;
  status: string;
  summary: string | null;
  created_at: Date;
  updated_at: Date;
};

type AnswerRow = {
  id: string;
  request_id: string;
  organization_id: string | null;
  question_id: string;
  ordinal: number;
  value: string;
  created_at: Date;
};

type AttachmentRow = {
  id: string;
  request_id: string;
  organization_id: string | null;
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
  organization_id: string | null;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  note: string | null;
  changed_at: Date;
};

type RequestRowWithIdentity = RequestRow & {
  patient_name: string;
  patient_phone: string;
  last_name: string;
  first_name: string;
};

function mapRequestWithPatientIdentity(row: RequestRowWithIdentity): IntakeRequestWithPatientIdentity {
  return {
    ...mapRequest(row),
    patientName: row.patient_name,
    patientPhone: row.patient_phone,
    lastName: row.last_name,
    firstName: row.first_name,
  };
}

function mapRequest(row: RequestRow): IntakeRequest {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id ?? null,
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
    organizationId: row.organization_id ?? null,
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
    organizationId: row.organization_id ?? null,
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
    organizationId: row.organization_id ?? null,
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

function currentWriteOrganizationId(...fallbacks: (string | null | undefined)[]): string | null {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  const fallbackOrganizationIds = fallbacks.filter((x): x is string => Boolean(x));
  const fallbackOrganizationId = fallbackOrganizationIds[0] ?? null;
  const hasFallbackMismatch = fallbackOrganizationIds.some((id) => id !== fallbackOrganizationId);
  if (
    hasFallbackMismatch ||
    (principalOrganizationId && fallbackOrganizationId && principalOrganizationId !== fallbackOrganizationId)
  ) {
    throw new Error("organization_principal_mismatch");
  }
  return principalOrganizationId ?? fallbackOrganizationId;
}

async function resolveWriteOrganizationIdForUser(client: PoolClient, userId: string): Promise<string | null> {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  if (principalOrganizationId) return principalOrganizationId;

  const { rows } = await runIntakePgText<{ organization_id: string }>(
    client,
    `SELECT organization_id
     FROM org_enrollments
     WHERE platform_user_id = $1::uuid
       AND status = 'active'
     ORDER BY created_at ASC, organization_id ASC
     LIMIT 1`,
    [userId],
  );
  return rows[0]?.organization_id ?? null;
}

function principalWhereClause(columnSql: string, params: unknown[], idx: number): { clause: string; nextIdx: number } {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  if (!principalOrganizationId) return { clause: "", nextIdx: idx };
  params.push(principalOrganizationId);
  return { clause: `${columnSql} = $${idx++}::uuid`, nextIdx: idx };
}

export function createPgOnlineIntakePort(): OnlineIntakePort {
  return {
    async createLfkRequest(input: CreateLfkIntakeInput): Promise<IntakeRequest> {
      const pool = getPool();
      return withPoolTransaction(pool, async (client) => {
        await pgAdvisoryXactLockShared(client, input.userId);
        const id = randomUUID();
        const organizationId = await resolveWriteOrganizationIdForUser(client, input.userId);
        const summary = input.description.slice(0, 200);

        const { rows } = await runIntakePgText<RequestRow>(
          client,
          `INSERT INTO online_intake_requests (id, user_id, organization_id, type, summary)
           VALUES ($1, $2, $3, 'lfk', $4)
           RETURNING *`,
          [id, input.userId, organizationId, summary],
        );
        const request = mapRequest(rows[0]);

        await runIntakePgText(
          client,
          `INSERT INTO online_intake_answers (id, request_id, organization_id, question_id, ordinal, value)
           VALUES ($1, $2, $3, 'lfk_description', 1, $4)`,
          [randomUUID(), id, organizationId, input.description],
        );

        for (const url of input.attachmentUrls ?? []) {
          await runIntakePgText(
            client,
            `INSERT INTO online_intake_attachments (id, request_id, organization_id, attachment_type, url)
             VALUES ($1, $2, $3, 'url', $4)`,
            [randomUUID(), id, organizationId, url],
          );
        }

        for (const fileId of input.attachmentFileIds ?? []) {
          const resolved = await resolveMediaFileForLfkAttachment(client, fileId, input.userId);
          await runIntakePgText(
            client,
            `INSERT INTO online_intake_attachments
               (id, request_id, organization_id, attachment_type, s3_key, mime_type, size_bytes, original_name)
             VALUES ($1, $2, $3, 'file', $4, $5, $6, $7)`,
            [
              randomUUID(),
              id,
              organizationId,
              resolved.s3Key,
              resolved.mimeType,
              resolved.sizeBytes,
              resolved.originalName,
            ],
          );
        }

        await runIntakePgText(
          client,
          `INSERT INTO online_intake_status_history (id, request_id, organization_id, from_status, to_status)
           VALUES ($1, $2, $3, NULL, 'new')`,
          [randomUUID(), id, organizationId],
        );

        return request;
      });
    },

    async createNutritionRequest(input: CreateNutritionIntakeInput): Promise<IntakeRequest> {
      const pool = getPool();
      return withPoolTransaction(pool, async (client) => {
        await pgAdvisoryXactLockShared(client, input.userId);
        const id = randomUUID();
        const organizationId = await resolveWriteOrganizationIdForUser(client, input.userId);
        const summary = input.description.slice(0, 200);

        const { rows } = await runIntakePgText<RequestRow>(
          client,
          `INSERT INTO online_intake_requests (id, user_id, organization_id, type, summary)
           VALUES ($1, $2, $3, 'nutrition', $4)
           RETURNING *`,
          [id, input.userId, organizationId, summary],
        );
        const request = mapRequest(rows[0]);

        await runIntakePgText(
          client,
          `INSERT INTO online_intake_answers (id, request_id, organization_id, question_id, ordinal, value)
           VALUES ($1, $2, $3, 'nutrition_description', 1, $4)`,
          [randomUUID(), id, organizationId, input.description],
        );

        await runIntakePgText(
          client,
          `INSERT INTO online_intake_status_history (id, request_id, organization_id, from_status, to_status)
           VALUES ($1, $2, $3, NULL, 'new')`,
          [randomUUID(), id, organizationId],
        );

        return request;
      });
    },

    async getById(id: string): Promise<IntakeRequestFull | null> {
      const reqParams: unknown[] = [id];
      const reqPrincipal = principalWhereClause("organization_id", reqParams, 2);
      const reqOrgWhere = reqPrincipal.clause ? ` AND ${reqPrincipal.clause}` : "";
      const { rows: reqRows } = await runWebappPgText<RequestRow>(
        `SELECT * FROM online_intake_requests WHERE id = $1${reqOrgWhere}`,
        reqParams,
      );
      if (!reqRows[0]) return null;
      const request = mapRequest(reqRows[0]);
      const childParams: unknown[] = [id];
      const childPrincipal = principalWhereClause("organization_id", childParams, 2);
      const childOrgWhere = childPrincipal.clause ? ` AND ${childPrincipal.clause}` : "";

      const { rows: ansRows } = await runWebappPgText<AnswerRow>(
        `SELECT * FROM online_intake_answers WHERE request_id = $1${childOrgWhere} ORDER BY ordinal`,
        childParams,
      );
      const { rows: attRows } = await runWebappPgText<AttachmentRow>(
        `SELECT * FROM online_intake_attachments WHERE request_id = $1${childOrgWhere} ORDER BY created_at`,
        childParams,
      );
      const { rows: histRows } = await runWebappPgText<HistoryRow>(
        `SELECT * FROM online_intake_status_history WHERE request_id = $1${childOrgWhere} ORDER BY changed_at`,
        childParams,
      );

      return {
        ...request,
        answers: ansRows.map(mapAnswer),
        attachments: attRows.map(mapAttachment),
        statusHistory: histRows.map(mapHistory),
      };
    },

    async getByIdForDoctor(id: string): Promise<IntakeRequestFullWithPatientIdentity | null> {
      const reqParams: unknown[] = [id];
      const reqPrincipal = principalWhereClause("r.organization_id", reqParams, 2);
      const reqOrgWhere = reqPrincipal.clause ? ` AND ${reqPrincipal.clause}` : "";
      const { rows: reqRows } = await runWebappPgText<RequestRowWithIdentity>(
        `SELECT r.*, COALESCE(pu.display_name, '') AS patient_name, COALESCE(pu.phone_normalized, '') AS patient_phone,
                COALESCE(pu.last_name, '') AS last_name, COALESCE(pu.first_name, '') AS first_name
         FROM online_intake_requests r
         LEFT JOIN platform_users pu ON pu.id = r.user_id
         WHERE r.id = $1${reqOrgWhere}`,
        reqParams,
      );
      if (!reqRows[0]) return null;
      const reqRow = reqRows[0];
      const request = mapRequest(reqRow);
      const patientName = reqRow.patient_name;
      const patientPhone = reqRow.patient_phone;
      const lastName = reqRow.last_name;
      const firstName = reqRow.first_name;
      const childParams: unknown[] = [id];
      const childPrincipal = principalWhereClause("organization_id", childParams, 2);
      const childOrgWhere = childPrincipal.clause ? ` AND ${childPrincipal.clause}` : "";

      const { rows: ansRows } = await runWebappPgText<AnswerRow>(
        `SELECT * FROM online_intake_answers WHERE request_id = $1${childOrgWhere} ORDER BY ordinal`,
        childParams,
      );
      const { rows: attRows } = await runWebappPgText<AttachmentRow>(
        `SELECT * FROM online_intake_attachments WHERE request_id = $1${childOrgWhere} ORDER BY created_at`,
        childParams,
      );
      const { rows: histRows } = await runWebappPgText<HistoryRow>(
        `SELECT * FROM online_intake_status_history WHERE request_id = $1${childOrgWhere} ORDER BY changed_at`,
        childParams,
      );

      return {
        ...request,
        patientName,
        patientPhone,
        lastName,
        firstName,
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
      const principal = principalWhereClause("organization_id", params, idx);
      if (principal.clause) {
        conditions.push(principal.clause);
        idx = principal.nextIdx;
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
      const principal = principalWhereClause("r.organization_id", params, idx);
      if (principal.clause) {
        conditions.push(principal.clause);
        idx = principal.nextIdx;
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
        `SELECT r.*, COALESCE(pu.display_name, '') AS patient_name, COALESCE(pu.phone_normalized, '') AS patient_phone,
                COALESCE(pu.last_name, '') AS last_name, COALESCE(pu.first_name, '') AS first_name
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
      return withPoolTransaction(pool, async (client) => {
        const { rows: cur } = await runIntakePgText<RequestRow>(
          client,
          `SELECT * FROM online_intake_requests WHERE id = $1 FOR UPDATE`,
          [input.requestId],
        );
        if (!cur[0]) throw Object.assign(new Error("not_found"), { code: "NOT_FOUND" });

        const organizationId = currentWriteOrganizationId(cur[0].organization_id);
        const fromStatus = cur[0].status;

        const { rows } = await runIntakePgText<RequestRow>(
          client,
          `UPDATE online_intake_requests
           SET organization_id = $1, status = $2, updated_at = now()
           WHERE id = $3
           RETURNING *`,
          [organizationId, input.toStatus, input.requestId],
        );

        await runIntakePgText(
          client,
          `INSERT INTO online_intake_status_history
             (id, request_id, organization_id, from_status, to_status, changed_by, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            randomUUID(),
            input.requestId,
            organizationId,
            fromStatus,
            input.toStatus,
            input.changedBy ?? null,
            input.note ?? null,
          ],
        );

        return mapRequest(rows[0]);
      });
    },

    async getDoctorStats(days: number): Promise<IntakeDoctorStats> {
      const db = getDrizzle();
      const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
      const result = await db.execute<{ status: string; cnt: string }>(sql`
        SELECT status, COUNT(*) AS cnt
        FROM online_intake_requests
        WHERE created_at >= NOW() - (${String(days)} || ' days')::interval
          AND (${principalOrganizationId ?? null}::uuid IS NULL OR organization_id = ${principalOrganizationId}::uuid)
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

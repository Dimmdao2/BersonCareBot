/**
 * Appointment records projection (Stage 9).
 * Idempotent by integrator_record_id; used for product reads and integrator API.
 */

import { getPool } from "@/infra/db/client";

export type AppointmentRecordRow = {
  id: string;
  integratorRecordId: string;
  phoneNormalized: string | null;
  recordAt: string | null;
  status: string;
  payloadJson: Record<string, unknown>;
  lastEvent: string;
  branchId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppointmentProjectionPort = {
  upsertRecordFromProjection(params: {
    integratorRecordId: string;
    phoneNormalized: string | null;
    recordAt: string | null;
    status: string;
    payloadJson: Record<string, unknown>;
    lastEvent: string;
    updatedAt: string;
    branchId?: string | null;
  }): Promise<void>;
  getRecordByIntegratorId(integratorRecordId: string): Promise<AppointmentRecordRow | null>;
  listActiveByPhoneNormalized(phoneNormalized: string): Promise<AppointmentRecordRow[]>;
};

function mapRow(r: {
  id: string;
  integrator_record_id: string;
  phone_normalized: string | null;
  record_at: Date | null;
  status: string;
  payload_json: unknown;
  last_event: string;
  branch_id: string | null;
  created_at: Date;
  updated_at: Date;
}): AppointmentRecordRow {
  return {
    id: r.id,
    integratorRecordId: r.integrator_record_id,
    phoneNormalized: r.phone_normalized,
    recordAt: r.record_at ? r.record_at.toISOString() : null,
    status: r.status,
    payloadJson:
      typeof r.payload_json === "object" && r.payload_json !== null
        ? (r.payload_json as Record<string, unknown>)
        : {},
    lastEvent: r.last_event ?? "",
    branchId: r.branch_id ?? null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export function createPgAppointmentProjectionPort(): AppointmentProjectionPort {
  return {
    async upsertRecordFromProjection(params) {
      const pool = getPool();
      await pool.query(
        `INSERT INTO appointment_records (
          integrator_record_id, phone_normalized, record_at, status, payload_json, last_event, updated_at, branch_id
        ) VALUES ($1, $2, $3::timestamptz, $4, $5::jsonb, $6, $7::timestamptz, $8::uuid)
        ON CONFLICT (integrator_record_id) DO UPDATE SET
          phone_normalized = EXCLUDED.phone_normalized,
          record_at = EXCLUDED.record_at,
          status = EXCLUDED.status,
          payload_json = EXCLUDED.payload_json,
          last_event = EXCLUDED.last_event,
          updated_at = EXCLUDED.updated_at,
          branch_id = EXCLUDED.branch_id`,
        [
          params.integratorRecordId,
          params.phoneNormalized,
          params.recordAt,
          params.status,
          JSON.stringify(params.payloadJson),
          params.lastEvent,
          params.updatedAt,
          params.branchId ?? null,
        ]
      );
    },

    async getRecordByIntegratorId(integratorRecordId: string): Promise<AppointmentRecordRow | null> {
      const pool = getPool();
      const result = await pool.query<{
        id: string;
        integrator_record_id: string;
        phone_normalized: string | null;
        record_at: Date | null;
        status: string;
        payload_json: unknown;
        last_event: string;
        branch_id: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, integrator_record_id, phone_normalized, record_at, status, payload_json, last_event, branch_id, created_at, updated_at
         FROM appointment_records WHERE integrator_record_id = $1 LIMIT 1`,
        [integratorRecordId]
      );
      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },

    async listActiveByPhoneNormalized(phoneNormalized: string): Promise<AppointmentRecordRow[]> {
      const pool = getPool();
      const result = await pool.query<{
        id: string;
        integrator_record_id: string;
        phone_normalized: string | null;
        record_at: Date | null;
        status: string;
        payload_json: unknown;
        last_event: string;
        branch_id: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, integrator_record_id, phone_normalized, record_at, status, payload_json, last_event, branch_id, created_at, updated_at
         FROM appointment_records
         WHERE phone_normalized = $1 AND status IN ('created', 'updated')
         ORDER BY record_at ASC NULLS LAST`,
        [phoneNormalized]
      );
      return result.rows.map(mapRow);
    },
  };
}

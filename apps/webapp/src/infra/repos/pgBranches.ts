/**
 * Branches projection (Rubitime branch_id). Idempotent upsert by integrator_branch_id.
 */

import { getPool } from "@/infra/db/client";

export type BranchRow = {
  id: string;
  integratorBranchId: number;
  name: string | null;
  metaJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type BranchesProjectionPort = {
  upsertFromProjection(params: {
    integratorBranchId: number | string;
    name?: string | null;
    metaJson?: Record<string, unknown>;
  }): Promise<{ branchId: string }>;
  getByIntegratorBranchId(integratorBranchId: number | string): Promise<BranchRow | null>;
};

function parseIntegratorBranchId(value: number | string): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const s = typeof value === "string" ? value.trim() : String(value);
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

export function createPgBranchesProjectionPort(): BranchesProjectionPort {
  return {
    async upsertFromProjection(params) {
      const pool = getPool();
      const integratorBranchId = parseIntegratorBranchId(params.integratorBranchId);
      const name = params.name ?? null;
      const metaJson = params.metaJson ?? {};
      const result = await pool.query<{ id: string }>(
        `INSERT INTO branches (integrator_branch_id, name, meta_json, updated_at)
         VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (integrator_branch_id) DO UPDATE SET
           name = COALESCE(NULLIF(TRIM(EXCLUDED.name), ''), branches.name),
           updated_at = now()
         RETURNING id`,
        [integratorBranchId, name, JSON.stringify(metaJson)]
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error("branches upsert did not return id");
      return { branchId: id };
    },

    async getByIntegratorBranchId(integratorBranchId: number | string): Promise<BranchRow | null> {
      const pool = getPool();
      const id = parseIntegratorBranchId(integratorBranchId);
      const result = await pool.query<{
        id: string;
        integrator_branch_id: number;
        name: string | null;
        meta_json: unknown;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, integrator_branch_id, name, meta_json, created_at, updated_at
         FROM branches WHERE integrator_branch_id = $1 LIMIT 1`,
        [id]
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        integratorBranchId: row.integrator_branch_id,
        name: row.name,
        metaJson:
          typeof row.meta_json === "object" && row.meta_json !== null
            ? (row.meta_json as Record<string, unknown>)
            : {},
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    },
  };
}

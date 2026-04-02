import { getPool } from "@/infra/db/client";

export type RubitimeBranchServiceLookupRow = {
  branchServiceId: string;
  branchId: string;
  serviceId: string;
  cityCode: string;
  branchTitle: string;
  serviceTitle: string;
  durationMinutes: number;
  priceMinor: number;
  rubitimeCooperatorId: string;
};

/**
 * Deterministic lookup: booking_branches.rubitime_branch_id + booking_branch_services.rubitime_service_id,
 * optionally filtered by specialist `rubitime_cooperator_id` when provided (disambiguation).
 */
export async function lookupBranchServiceByRubitimeIds(
  rubitimeBranchId: string,
  rubitimeServiceId: string,
  rubitimeCooperatorId?: string | null,
): Promise<{ result: RubitimeBranchServiceLookupRow | null; ambiguous: boolean }> {
  const pool = getPool();
  const res = await pool.query<{
    branch_service_id: string;
    branch_id: string;
    service_id: string;
    city_code: string;
    branch_title: string;
    service_title: string;
    duration_minutes: number;
    price_minor: number;
    rubitime_cooperator_id: string;
  }>(
    `SELECT
       bs.id AS branch_service_id,
       b.id AS branch_id,
       s.id AS service_id,
       c.code AS city_code,
       b.title AS branch_title,
       s.title AS service_title,
       s.duration_minutes,
       s.price_minor,
       sp.rubitime_cooperator_id AS rubitime_cooperator_id
     FROM booking_branches b
     JOIN booking_cities c ON c.id = b.city_id
     JOIN booking_branch_services bs ON bs.branch_id = b.id
     JOIN booking_services s ON s.id = bs.service_id
     JOIN booking_specialists sp ON sp.id = bs.specialist_id
     WHERE b.rubitime_branch_id = $1
       AND bs.rubitime_service_id = $2
       AND bs.is_active = TRUE
       AND b.is_active = TRUE
       AND ($3::text IS NULL OR sp.rubitime_cooperator_id = $3)
     ORDER BY
       CASE WHEN $3::text IS NOT NULL AND sp.rubitime_cooperator_id = $3 THEN 0 ELSE 1 END,
       bs.updated_at DESC
     LIMIT 2`,
    [rubitimeBranchId, rubitimeServiceId, rubitimeCooperatorId ?? null],
  );

  const rows = res.rows;
  if (rows.length === 0) {
    return { result: null, ambiguous: false };
  }
  if (rows.length > 1 && (rubitimeCooperatorId == null || rubitimeCooperatorId === "")) {
    return { result: null, ambiguous: true };
  }
  const r = rows[0]!;
  return {
    result: {
      branchServiceId: r.branch_service_id,
      branchId: r.branch_id,
      serviceId: r.service_id,
      cityCode: r.city_code,
      branchTitle: r.branch_title,
      serviceTitle: r.service_title,
      durationMinutes: r.duration_minutes,
      priceMinor: r.price_minor,
      rubitimeCooperatorId: r.rubitime_cooperator_id,
    },
    ambiguous: false,
  };
}

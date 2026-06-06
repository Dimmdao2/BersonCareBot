import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("pgAppointmentProjection upsert contract", () => {
  it("keeps immutable phone snapshot and merges platform_user_id on conflict", () => {
    const file = path.join(process.cwd(), "src/infra/repos/pgAppointmentProjection.ts");
    const src = readFileSync(file, "utf8");
    expect(src).toContain(
      "phone_normalized = COALESCE(appointment_records.phone_normalized, EXCLUDED.phone_normalized)",
    );
    expect(src).toContain("platform_user_id = CASE");
    expect(src).toContain("WHEN EXCLUDED.platform_user_id IS NOT NULL THEN EXCLUDED.platform_user_id");
    expect(src).toContain("WHEN EXCLUDED.phone_normalized IS NOT NULL AND EXCLUDED.record_at IS NOT NULL THEN NULL");
    expect(src).toContain("ELSE appointment_records.platform_user_id");
    expect(src).toContain("COUNT(*) OVER () AS owner_count");
    expect(src).toContain("WHERE owner_count = 1");
    expect(src).toContain("h.valid_from <= COALESCE($3::timestamptz, now())");
    expect(src).toContain("(h.valid_to IS NULL OR h.valid_to > COALESCE($3::timestamptz, now()))");
    expect(src).toContain("h_other_claim.platform_user_id <> pu.id");
    expect(src).toContain(
      "branch_id = COALESCE(EXCLUDED.branch_id, appointment_records.branch_id)",
    );
  });
});

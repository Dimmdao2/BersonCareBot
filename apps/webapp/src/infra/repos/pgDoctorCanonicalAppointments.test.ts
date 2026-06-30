import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoDir = dirname(fileURLToPath(import.meta.url));

describe("pgDoctorCanonicalAppointments purge filter", () => {
  it("listAppointmentsForSpecialist post-filters staff-purged canonical rows", () => {
    const src = readFileSync(join(repoDir, "pgDoctorCanonicalAppointments.ts"), "utf8");
    expect(src).toContain("filterCanonicalRowsNotPurged");
    expect(src).toMatch(/visibleRows = await filterCanonicalRowsNotPurged/);
    expect(src).toContain("BE_APPOINTMENTS_NOT_PURGED");
  });
});

describe("pgDoctorCanonicalAppointments soft-delete filter (F1b)", () => {
  it("excludes soft-deleted canonical rows across list/stats/KPI/dashboard reads", () => {
    const src = readFileSync(join(repoDir, "pgDoctorCanonicalAppointments.ts"), "utf8");
    // Drizzle column filter on every aggregate/list condition.
    expect(src).toContain("isNull(beAppointments.deletedAt)");
    // firstVisit NOT EXISTS subquery (`earlier` alias) also excludes soft-deleted prior visits.
    expect(src).toContain("earlier.deleted_at IS NULL");
    // No fewer than the conditions we added (list base + statsRange + cancellations + monthly-cancel
    // + stats rangeCond/createdInRangeCond + joins + cancel30 + orgCond + KPI active/cancelled ranges).
    const occurrences = src.match(/isNull\(beAppointments\.deletedAt\)/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(10);
  });
});

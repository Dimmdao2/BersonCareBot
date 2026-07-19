import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createPgDoctorCanonicalAppointmentsPort } from "./pgDoctorCanonicalAppointments";
import type {
  ScheduleKpis,
  ScheduleKpisQuery,
} from "@/modules/doctor-appointments/ports";

const repoDir = dirname(fileURLToPath(import.meta.url));

describe("pgDoctorCanonicalAppointments purge filter", () => {
  it("listAppointmentsForSpecialist post-filters staff-purged canonical rows", () => {
    const src = readFileSync(join(repoDir, "pgDoctorCanonicalAppointments.ts"), "utf8");
    expect(src).toContain("filterCanonicalRowsNotPurged");
    expect(src).toMatch(/visibleRows = await filterCanonicalRowsNotPurged/);
    expect(src).toContain("BE_APPOINTMENTS_NOT_PURGED");
  });
});

describe("pgDoctorCanonicalAppointments typed joins", () => {
  it("joins package usage through a UUID-safe text cast", () => {
    const src = readFileSync(join(repoDir, "pgDoctorCanonicalAppointments.ts"), "utf8");
    expect(src).toContain("function packageUsageJoinCond");
    expect(src).toContain("packageUsageRef} ~ ${UUID_TEXT_RE}");
    expect(src).toContain("packageUsageRef}::uuid");
    expect(src).not.toContain("eq(bePackageUsages.id, beAppointments.packageUsageRef)");
  });
});

describe("pgDoctorCanonicalAppointments FIO display", () => {
  it("derives appointment labels from structured FIO with a display_name fallback", () => {
    const src = readFileSync(join(repoDir, "pgDoctorCanonicalAppointments.ts"), "utf8");
    expect(src).toContain("formatDoctorFio");
    expect(src).toContain("patronymic: row.patronymic");
    expect(src).toContain("row.displayName,");
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

describe("pgDoctorCanonicalAppointments schedule KPI organization gate", () => {
  it("fails closed before DB/default lookup when organization is absent at runtime", async () => {
    const getDefaultOrganizationId = vi.fn(async () => "default-organization");
    const port = createPgDoctorCanonicalAppointmentsPort(getDefaultOrganizationId);
    const unsafeGetScheduleKpis = port.getScheduleKpis as unknown as (
      query: ScheduleKpisQuery,
      audience?: { excludedUserIds?: string[]; organizationId?: string },
    ) => Promise<ScheduleKpis>;

    await expect(
      unsafeGetScheduleKpis({ from: "2026-06-01T00:00:00Z", to: "2026-06-02T00:00:00Z" }),
    ).rejects.toThrow("schedule_kpis_organization_required");
    expect(getDefaultOrganizationId).not.toHaveBeenCalled();
  });

  it("contains no default-organization fallback inside getScheduleKpis", () => {
    const src = readFileSync(join(repoDir, "pgDoctorCanonicalAppointments.ts"), "utf8");
    const method = src.slice(
      src.indexOf("async getScheduleKpis("),
      src.indexOf("async getAppointmentDailySeries("),
    );

    expect(method).toContain("schedule_kpis_organization_required");
    expect(method).not.toContain("getDefaultOrganizationId");
  });
});

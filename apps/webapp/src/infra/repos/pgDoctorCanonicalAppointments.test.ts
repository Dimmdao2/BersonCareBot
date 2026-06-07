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

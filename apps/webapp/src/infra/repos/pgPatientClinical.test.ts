import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pgPatientClinical principal transaction invariants", () => {
  it("clinical write methods use the Drizzle mutation transaction chokepoint", () => {
    const src = readFileSync(new URL("./pgPatientClinical.ts", import.meta.url), "utf8");

    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src.match(/runDrizzleMutationTransaction/g)?.length ?? 0).toBeGreaterThanOrEqual(9);
    expect(src).not.toContain("db.transaction");
  });

  it("clinical appointment links use canonical appointments at runtime", () => {
    const src = readFileSync(new URL("./pgPatientClinical.ts", import.meta.url), "utf8");

    expect(src).toContain("canonicalAppointmentId");
    expect(src).toContain("FROM be_appointments bea");
    expect(src).toContain("JOIN be_package_usages u");
    expect(src).not.toContain("FROM appointment_records");
    expect(src).not.toContain("JOIN appointment_records");
  });
});

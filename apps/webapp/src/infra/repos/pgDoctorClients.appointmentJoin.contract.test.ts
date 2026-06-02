import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("pgDoctorClients appointment_records join", () => {
  it("limits phone fallback to legacy rows and time-bounded history", () => {
    const file = path.join(process.cwd(), "src/infra/repos/pgDoctorClients.ts");
    const src = readFileSync(file, "utf8");
    expect(src).toContain("${arAlias}.platform_user_id IS NULL");
    expect(src).toContain("h.valid_from <=");
    expect(src).toContain("h.valid_to");
    expect(src).toContain("COALESCE(${arAlias}.record_at, ${arAlias}.created_at)");
    expect(src).toContain("h_other_claim.platform_user_id <> ${puAlias}.id");
    expect(src).toContain("NOT EXISTS");
  });

  it("scopes active treatment program to assignment_source doctor (clinical)", () => {
    const file = path.join(process.cwd(), "src/infra/repos/pgDoctorClients.ts");
    const src = readFileSync(file, "utf8");
    expect(src).toContain("assignment_source = 'doctor'");
    expect(src).toMatch(/status\s*=\s*'active'\s+AND\s+assignment_source\s*=\s*'doctor'/);
  });
});

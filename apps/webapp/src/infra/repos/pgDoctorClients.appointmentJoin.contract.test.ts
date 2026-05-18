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
  });
});

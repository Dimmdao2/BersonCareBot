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
    expect(src).toContain(
      "platform_user_id = COALESCE(appointment_records.platform_user_id, EXCLUDED.platform_user_id)",
    );
  });
});

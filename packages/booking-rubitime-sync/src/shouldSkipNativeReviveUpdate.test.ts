import { describe, expect, it, vi } from "vitest";
import { shouldSkipNativeReviveUpdate } from "./shouldSkipNativeReviveUpdate.js";
import type { SqlExecutor } from "./sql.js";
import type { ExistingPatientBookingRow } from "./upsertPatientBookingFromRubitime.js";

const baseRow: ExistingPatientBookingRow = {
  id: "n1",
  source: "native",
  slot_start: new Date("2026-05-01T10:00:00.000Z"),
  status: "confirmed",
  canonical_appointment_id: "appt-1",
};

describe("shouldSkipNativeReviveUpdate", () => {
  it("returns false for rubitime_projection rows", async () => {
    const db: SqlExecutor = { query: vi.fn() };
    const skip = await shouldSkipNativeReviveUpdate(
      db,
      { ...baseRow, source: "rubitime_projection" },
      { status: "confirmed" },
    );
    expect(skip).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns true when native row is already cancelled", async () => {
    const db: SqlExecutor = { query: vi.fn() };
    const skip = await shouldSkipNativeReviveUpdate(db, { ...baseRow, status: "cancelled" }, { status: "confirmed" });
    expect(skip).toBe(true);
  });

  it("returns true when canonical appointment is terminal", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ status: "cancelled_by_patient" }] });
    const skip = await shouldSkipNativeReviveUpdate({ query }, baseRow, { status: "confirmed" });
    expect(skip).toBe(true);
  });

  it("returns false when canonical appointment is active", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ status: "confirmed" }] });
    const skip = await shouldSkipNativeReviveUpdate({ query }, baseRow, { status: "confirmed" });
    expect(skip).toBe(false);
  });
});

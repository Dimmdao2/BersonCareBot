/**
 * Unit tests for pgBookingScheduling row-mapper functions.
 *
 * These are pure-function tests that require no DB connection — they exercise the
 * snake_case → camelCase mapping that was the source of a correctness bug fixed in
 * the orchestrator review pass (DOCTOR_SCHEDULE_SECTION_INITIATIVE LOG 2026-06-12).
 *
 * Specifically, `mapRawWorkingDayRow` was added to handle RETURNING* from raw SQL
 * execute calls; the original code read camelCase fields from a snake_case result
 * which silently produced undefined values.
 */

// ── Drizzle isolation — mock getDrizzle so import doesn't fail in unit env ───
vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: vi.fn() }));
vi.mock("@/modules/booking-scheduling/service", () => ({
  buildSlotsForContext: vi.fn(),
}));

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { mapRawWorkingDayRow, type RawWorkingDayRow } from "./pgBookingScheduling";

const repoDir = dirname(fileURLToPath(import.meta.url));

describe("pgBookingScheduling soft-delete filter (F1b)", () => {
  it("listBusyIntervals excludes soft-deleted canonical rows (deleted_at IS NULL)", () => {
    const src = readFileSync(join(repoDir, "pgBookingScheduling.ts"), "utf8");
    expect(src).toContain("isNull(beAppointments.deletedAt)");
  });
});

const SENTINEL_ID = "aaaabbbb-cccc-4ddd-8eee-ffffffffffff";
const ORG_ID     = "11111111-1111-4111-8111-111111111111";
const SPEC_ID    = "22222222-2222-4222-8222-222222222222";
const BRANCH_ID  = "33333333-3333-4333-8333-333333333333";

function raw(overrides: Partial<RawWorkingDayRow> = {}): RawWorkingDayRow {
  return {
    id: SENTINEL_ID,
    organization_id: ORG_ID,
    specialist_id: SPEC_ID,
    branch_id: BRANCH_ID,
    room_id: null,
    work_date: "2026-06-15",
    start_minute: 540,
    end_minute: 1080,
    breaks: null,
    is_closed: false,
    ...overrides,
  };
}

describe("mapRawWorkingDayRow — snake_case RETURNING* → WorkingDayRecord", () => {
  it("maps all camelCase fields correctly from snake_case raw row", () => {
    const rec = mapRawWorkingDayRow(raw());
    expect(rec.id).toBe(SENTINEL_ID);
    expect(rec.organizationId).toBe(ORG_ID);
    expect(rec.specialistId).toBe(SPEC_ID);
    expect(rec.branchId).toBe(BRANCH_ID);
    expect(rec.roomId).toBeNull();
    expect(rec.workDate).toBe("2026-06-15");
    expect(rec.startMinute).toBe(540);
    expect(rec.endMinute).toBe(1080);
    expect(rec.breaks).toEqual([]);
    expect(rec.isClosed).toBe(false);
  });

  it("maps a closed day correctly (is_closed=true, minutes null)", () => {
    const rec = mapRawWorkingDayRow(
      raw({ start_minute: null, end_minute: null, is_closed: true, specialist_id: null }),
    );
    expect(rec.isClosed).toBe(true);
    expect(rec.startMinute).toBeNull();
    expect(rec.endMinute).toBeNull();
    expect(rec.specialistId).toBeNull();
    expect(rec.breaks).toEqual([]);
  });

  it("maps breaks jsonb column when present", () => {
    const rec = mapRawWorkingDayRow(
      raw({
        breaks: [
          { startMinute: 720, endMinute: 780 },
          { startMinute: 900, endMinute: 960 },
        ],
      }),
    );
    expect(rec.breaks).toHaveLength(2);
    expect(rec.breaks[0]).toEqual({ startMinute: 720, endMinute: 780 });
    expect(rec.breaks[1]).toEqual({ startMinute: 900, endMinute: 960 });
  });

  it("null specialist_id and branch_id are preserved", () => {
    const rec = mapRawWorkingDayRow(raw({ specialist_id: null, branch_id: null }));
    expect(rec.specialistId).toBeNull();
    expect(rec.branchId).toBeNull();
  });
});

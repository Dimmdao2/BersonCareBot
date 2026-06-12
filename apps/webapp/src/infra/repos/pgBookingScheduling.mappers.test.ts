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

import { describe, expect, it, vi } from "vitest";
import { mapRawWorkingDayRow, type RawWorkingDayRow } from "./pgBookingScheduling";

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
    break_start_minute: null,
    break_end_minute: null,
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
    expect(rec.breakStartMinute).toBeNull();
    expect(rec.breakEndMinute).toBeNull();
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
  });

  it("maps break minutes when present", () => {
    const rec = mapRawWorkingDayRow(
      raw({ break_start_minute: 780, break_end_minute: 840 }),
    );
    expect(rec.breakStartMinute).toBe(780);
    expect(rec.breakEndMinute).toBe(840);
  });

  it("null specialist_id and branch_id are preserved", () => {
    const rec = mapRawWorkingDayRow(raw({ specialist_id: null, branch_id: null }));
    expect(rec.specialistId).toBeNull();
    expect(rec.branchId).toBeNull();
  });
});

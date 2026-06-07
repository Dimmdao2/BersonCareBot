import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import {
  filterCanonicalRowsNotPurged,
  integratorKeysForCanonicalAppointment,
  isAppointmentIntegratorPurged,
  loadPurgedCanonicalAppointmentIds,
  PURGED_CANONICAL_APPOINTMENT_NOT_EXISTS_SQL,
  PURGED_CANONICAL_BE_APPOINTMENTS_NOT_EXISTS_SQL,
} from "./doctorAppointmentPurgeFilter";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const APPT_A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const APPT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("doctorAppointmentPurgeFilter", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("integratorKeysForCanonicalAppointment includes be: id and rubitime id", () => {
    expect(integratorKeysForCanonicalAppointment(APPT_A, "rt-1")).toEqual([`be:${APPT_A}`, "rt-1"]);
    expect(integratorKeysForCanonicalAppointment(APPT_A, null)).toEqual([`be:${APPT_A}`]);
  });

  it("isAppointmentIntegratorPurged matches purged integrator keys", () => {
    const purged = new Set([`be:${APPT_A}`, "rt-other"]);
    expect(isAppointmentIntegratorPurged(APPT_A, "rt-1", purged)).toBe(true);
    expect(isAppointmentIntegratorPurged(APPT_B, "rt-9", purged)).toBe(false);
  });

  it("loadPurgedCanonicalAppointmentIds queries appointment_records tombstones", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [{ id: APPT_A }] });

    const purged = await loadPurgedCanonicalAppointmentIds(ORG_ID, [APPT_A, APPT_B]);

    expect(purged).toEqual(new Set([APPT_A]));
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("appointment_records");
    expect(sql).toContain("deleted_at IS NOT NULL");
    expect(sql).toContain("be_external_entity_mappings");
  });

  it("filterCanonicalRowsNotPurged removes purged appointment ids", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [{ id: APPT_A }] });

    const rows = [
      { id: APPT_A, status: "cancelled_by_specialist" },
      { id: APPT_B, status: "confirmed" },
    ];
    const visible = await filterCanonicalRowsNotPurged(ORG_ID, rows);

    expect(visible).toEqual([{ id: APPT_B, status: "confirmed" }]);
  });

  it("filterCanonicalRowsNotPurged is no-op when nothing purged", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [] });

    const rows = [{ id: APPT_A, status: "cancelled_by_patient" }];
    const visible = await filterCanonicalRowsNotPurged(ORG_ID, rows);

    expect(visible).toEqual(rows);
  });

  it("PURGED_CANONICAL_APPOINTMENT_NOT_EXISTS_SQL references be_appointments alias a", () => {
    expect(PURGED_CANONICAL_APPOINTMENT_NOT_EXISTS_SQL).toContain("be:' || a.id::text");
    expect(PURGED_CANONICAL_APPOINTMENT_NOT_EXISTS_SQL).toContain("a.organization_id");
  });

  it("PURGED_CANONICAL_BE_APPOINTMENTS_NOT_EXISTS_SQL uses bare be_appointments table", () => {
    expect(PURGED_CANONICAL_BE_APPOINTMENTS_NOT_EXISTS_SQL).toContain("be_appointments.id::text");
    expect(PURGED_CANONICAL_BE_APPOINTMENTS_NOT_EXISTS_SQL).toContain("be_appointments.organization_id");
  });
});

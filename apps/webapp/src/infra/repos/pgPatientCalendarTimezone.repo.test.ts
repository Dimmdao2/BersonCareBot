import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

import {
  getPatientCalendarTimezoneIana,
  setPatientCalendarTimezoneIana,
  trySetInitialCalendarTimezoneIfEmpty,
} from "./pgPatientCalendarTimezone";

describe("pgPatientCalendarTimezone (repo SQL parity)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("getPatientCalendarTimezoneIana filters merged_into_id IS NULL", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ calendar_timezone: "Europe/Moscow" }] });
    const tz = await getPatientCalendarTimezoneIana("550e8400-e29b-41d4-a716-446655440000");
    expect(tz).toBe("Europe/Moscow");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("merged_into_id IS NULL");
  });

  it("setPatientCalendarTimezoneIana requires client role", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const ok = await setPatientCalendarTimezoneIana("550e8400-e29b-41d4-a716-446655440000", "Europe/Moscow");
    expect(ok).toBe(true);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("role = 'client'");
  });

  it("trySetInitialCalendarTimezoneIfEmpty skips invalid IANA", async () => {
    await trySetInitialCalendarTimezoneIfEmpty("550e8400-e29b-41d4-a716-446655440000", "Not/A/Timezone");
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it("trySetInitialCalendarTimezoneIfEmpty updates when IANA valid", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await trySetInitialCalendarTimezoneIfEmpty("550e8400-e29b-41d4-a716-446655440000", "Europe/Moscow");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("calendar_timezone IS NULL");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      "550e8400-e29b-41d4-a716-446655440000",
      "Europe/Moscow",
    ]);
  });
});

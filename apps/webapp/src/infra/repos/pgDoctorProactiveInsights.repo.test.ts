import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { createPgDoctorProactiveInsightsPort } from "./pgDoctorProactiveInsights";

describe("pgDoctorProactiveInsights repo", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("queryInsights returns empty when no on-support patients", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgDoctorProactiveInsightsPort();
    const result = await port.queryInsights({ limit: 5, displayIana: "Europe/Moscow" });

    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("doctor_patient_support");
  });

  it("queryInsights loads on-support patients then wellbeing and program SQL", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [{ id: "p1", display_name: "One" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgDoctorProactiveInsightsPort();
    const result = await port.queryInsights({ limit: 10, displayIana: "Europe/Moscow" });

    expect(result.totalCount).toBe(0);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(3);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("doctor_patient_support");
    expect(String(runWebappPgTextMock.mock.calls[1]?.[0])).toContain("symptom_entries");
    expect(String(runWebappPgTextMock.mock.calls[2]?.[0])).toContain("treatment_program_instances");
  });

  it("listForPatient queries single patient support ref then wellbeing/program SQL", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [{ id: "p1", display_name: "Patient One" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgDoctorProactiveInsightsPort();
    const items = await port.listForPatient({
      patientUserId: "p1",
      displayIana: "Europe/Moscow",
    });

    expect(Array.isArray(items)).toBe(true);
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["p1"]);
    expect(String(runWebappPgTextMock.mock.calls[1]?.[0])).toContain("symptom_entries");
    expect(String(runWebappPgTextMock.mock.calls[2]?.[0])).toContain("treatment_program_instances");
  });
});

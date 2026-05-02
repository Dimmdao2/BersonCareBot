import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() =>
  vi.fn(() => ({
    query: queryMock,
    release: vi.fn(),
  }))
);
const getPoolMock = vi.hoisted(() =>
  vi.fn(() => ({
    query: queryMock,
    connect: connectMock,
  }))
);

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { createPgLfkExercisesPort } from "./pgLfkExercises";

describe("createPgLfkExercisesPort", () => {
  beforeEach(() => {
    queryMock.mockReset();
    connectMock.mockClear();
  });

  it("list builds filter for load_type and archived", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkExercisesPort();
    await port.list({ loadType: "cardio", includeArchived: false });
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("load_type");
    expect(sql).toContain("is_archived = false");
  });

  it("list applies NFC-normalized ILIKE search for titles", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkExercisesPort();
    await port.list({ search: "Южный", includeArchived: true });
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("normalize(e.title, NFC)");
    expect(sql).toContain("ILIKE");
    expect(sql).toContain("ESCAPE '\\'");
    const params = queryMock.mock.calls[0]?.[1] as unknown[] | undefined;
    expect(Array.isArray(params)).toBe(true);
    expect(params?.some((p) => typeof p === "string" && p.includes("южный"))).toBe(true);
  });

  it("getExerciseUsageSummary runs scalar subqueries", async () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          published_lfk_templates: 1,
          draft_lfk_templates: 0,
          active_patient_lfk: 2,
          published_tp_templates: 0,
          draft_tp_templates: 1,
          active_tp_instances: 3,
          completed_tp_instances: 4,
        },
      ],
    });
    const port = createPgLfkExercisesPort();
    const u = await port.getExerciseUsageSummary(id);
    expect(u.publishedLfkComplexTemplateCount).toBe(1);
    expect(u.activePatientLfkAssignmentCount).toBe(2);
    expect(u.draftTreatmentProgramTemplateCount).toBe(1);
    expect(u.activeTreatmentProgramInstanceCount).toBe(3);
    expect(u.completedTreatmentProgramInstanceCount).toBe(4);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("published_lfk_templates");
    expect(sql).toContain("treatment_program_template_stage_items");
    expect(sql).toContain("patient_lfk_assignments");
    expect(sql).toContain("completed_tp_instances");
  });

  it("archive updates is_archived", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });
    const port = createPgLfkExercisesPort();
    const ok = await port.archive("550e8400-e29b-41d4-a716-446655440000");
    expect(ok).toBe(true);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("is_archived = true");
  });
});

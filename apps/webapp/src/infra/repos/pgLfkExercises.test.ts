import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const runWebappTransactionMock = vi.hoisted(() => vi.fn());
const pgPoolQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
  runWebappTransaction: runWebappTransactionMock,
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: pgPoolQueryMock }),
}));

import { createPgLfkExercisesPort } from "./pgLfkExercises";

const exerciseId = "550e8400-e29b-41d4-a716-446655440000";

function exerciseDbRow(overrides: Partial<{ id: string; title: string }> = {}) {
  return {
    id: exerciseId,
    title: "Присед",
    description: null,
    region_ref_id: null,
    load_type: null,
    difficulty_1_10: null,
    contraindications: null,
    tags: null,
    is_archived: false,
    created_by: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("createPgLfkExercisesPort", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappTransactionMock.mockReset();
    pgPoolQueryMock.mockReset();
    runWebappTransactionMock.mockImplementation(async (fn) => fn({ rollback: vi.fn() }));
  });

  it("list builds filter for load_type and archived", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkExercisesPort();
    await port.list({ loadType: "cardio", includeArchived: false });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("load_type");
    expect(sql).toContain("is_archived = false");
  });

  it("list with archiveListScope archived filters archived only", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkExercisesPort();
    await port.list({ archiveListScope: "archived" });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("is_archived = true");
  });

  it("list applies NFC-normalized ILIKE search for titles", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkExercisesPort();
    await port.list({ search: "Южный", includeArchived: true });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("normalize(e.title, NFC)");
    expect(sql).toContain("ILIKE");
    expect(sql).toContain("ESCAPE '\\'");
    const params = runWebappPgTextMock.mock.calls[0]?.[1] as unknown[] | undefined;
    expect(Array.isArray(params)).toBe(true);
    expect(params?.some((p) => typeof p === "string" && p.includes("южный"))).toBe(true);
  });

  it("getExerciseUsageSummary runs scalar subqueries and ref aggregates", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          published_lfk_templates: 1,
          draft_lfk_templates: 0,
          active_patient_lfk: 2,
          published_tp_templates: 0,
          draft_tp_templates: 1,
          active_tp_instances: 3,
          completed_tp_instances: 4,
          published_lfk_template_refs: [],
          draft_lfk_template_refs: [],
          published_tp_template_refs: [],
          draft_tp_template_refs: [],
          active_tp_instance_refs: [],
          completed_tp_instance_refs: [],
          active_patient_lfk_refs: [],
        },
      ],
    });
    const port = createPgLfkExercisesPort();
    const u = await port.getExerciseUsageSummary(exerciseId);
    expect(u.publishedLfkComplexTemplateCount).toBe(1);
    expect(u.activePatientLfkAssignmentCount).toBe(2);
    expect(u.draftTreatmentProgramTemplateCount).toBe(1);
    expect(u.activeTreatmentProgramInstanceCount).toBe(3);
    expect(u.completedTreatmentProgramInstanceCount).toBe(4);
    expect(u.publishedLfkComplexTemplateRefs).toEqual([]);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("published_lfk_template_refs");
    expect(sql).toContain("jsonb_agg");
    expect(sql).toContain("treatment_program_template_stage_items");
    expect(sql).toContain("patient_lfk_assignments");
    expect(sql).toContain("completed_tp_instances");
  });

  it("archive sets is_archived true when row updated", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const port = createPgLfkExercisesPort();
    const ok = await port.archive(exerciseId);
    expect(ok).toBe(true);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("is_archived = true");
  });

  it("unarchive updates is_archived to false", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const port = createPgLfkExercisesPort();
    const ok = await port.unarchive(exerciseId);
    expect(ok).toBe(true);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("is_archived = false");
  });

  it("create inserts exercise in transaction then loads media", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [exerciseDbRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkExercisesPort();
    const ex = await port.create({ title: "Присед" }, null);
    expect(ex.title).toBe("Присед");
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const txSql = runWebappPgTextMock.mock.calls
      .filter((c) => c[2] != null)
      .map((c) => String(c[0]))
      .join("\n");
    expect(txSql).toContain("INSERT INTO lfk_exercises");
  });

  it("update returns null when exercise not found", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkExercisesPort();
    const out = await port.update(exerciseId, { title: "X" });
    expect(out).toBeNull();
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("update applies title patch in transaction and reloads row", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ id: exerciseId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [exerciseDbRow({ title: "Новое" })] });
    const port = createPgLfkExercisesPort();
    const out = await port.update(exerciseId, { title: "Новое" });
    expect(out?.title).toBe("Новое");
    const txCalls = runWebappPgTextMock.mock.calls.filter((c) => c[2] != null);
    expect(txCalls.some((c) => String(c[0]).includes("UPDATE lfk_exercises"))).toBe(true);
  });

  it("listTitlesByIds passes ids as single uuid[] param", async () => {
    pgPoolQueryMock.mockResolvedValueOnce({
      rows: [{ id: exerciseId, title: "Присед" }],
    });
    const port = createPgLfkExercisesPort();
    const out = await port.listTitlesByIds([
      exerciseId,
      exerciseId,
      " 1fcb7fb7-3f85-4388-a607-5f008be4e3f1 ",
    ]);
    expect(out.get(exerciseId)).toBe("Присед");
    const params = pgPoolQueryMock.mock.calls[0]?.[1] as unknown[] | undefined;
    expect(Array.isArray(params)).toBe(true);
    expect(Array.isArray(params?.[0])).toBe(true);
    expect((params?.[0] as string[]).length).toBe(2);
  });
});

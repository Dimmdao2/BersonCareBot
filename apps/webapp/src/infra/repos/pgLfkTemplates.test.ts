import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const runWebappTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
  runWebappTransaction: runWebappTransactionMock,
}));

import { createPgLfkTemplatesPort } from "./pgLfkTemplates";

describe("createPgLfkTemplatesPort", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappTransactionMock.mockReset();
    runWebappTransactionMock.mockImplementation(async (fn) => fn({ rollback: vi.fn() }));
  });

  it("list includes exercise_count subquery", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkTemplatesPort();
    await port.list({ status: "draft" });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("exercise_count");
    expect(sql).toContain("lfk_complex_template_exercises");
  });

  it("list runs lightweight thumbnail query by default when templates exist", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          title: "T",
          description: null,
          status: "draft",
          created_by: null,
          created_at: new Date(),
          updated_at: new Date(),
          exercise_count: 0,
        },
      ],
    });
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkTemplatesPort();
    await port.list({ status: "draft" });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    const thumbSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
    expect(thumbSql).toContain("te_ranked");
    expect(thumbSql).toContain("lfk_complex_template_exercises");
    expect(thumbSql).toContain("lfk_exercise_media");
  });

  it("list uses full exercise join query when includeExerciseDetails is true", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          title: "T",
          description: null,
          status: "draft",
          created_by: null,
          created_at: new Date(),
          updated_at: new Date(),
          exercise_count: 0,
        },
      ],
    });
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkTemplatesPort();
    await port.list({ status: "draft", includeExerciseDetails: true });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    const sql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
    expect(sql).toContain("exercise_title");
    expect(sql).not.toContain("te_ranked");
  });

  it("getTemplateUsageSummary runs usage aggregate query", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          active_patient_lfk: 0,
          published_tp_templates: 0,
          draft_tp_templates: 0,
          active_tp_instances: 0,
          completed_tp_instances: 0,
          active_patient_lfk_refs: [],
          published_tp_template_refs: [],
          draft_tp_template_refs: [],
          active_tp_instance_refs: [],
          completed_tp_instance_refs: [],
        },
      ],
    });
    const port = createPgLfkTemplatesPort();
    const u = await port.getTemplateUsageSummary("00000000-0000-4000-8000-000000000099");
    expect(u.activePatientLfkAssignmentCount).toBe(0);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("lfk_complex");
    expect(sql).toContain("patient_lfk_assignments");
  });

  it("getTemplateUsageSummary parses non-empty ref aggregates", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          active_patient_lfk: 2,
          published_tp_templates: 1,
          draft_tp_templates: 0,
          active_tp_instances: 0,
          completed_tp_instances: 0,
          active_patient_lfk_refs: [
            {
              kind: "patient_lfk_assignment_client",
              id: "asg-1",
              title: "Комплекс — пациент",
              patientUserId: "patient-u1",
            },
          ],
          published_tp_template_refs: [
            { kind: "treatment_program_template", id: "tp-1", title: "Программа" },
          ],
          draft_tp_template_refs: [],
          active_tp_instance_refs: [],
          completed_tp_instance_refs: [],
        },
      ],
    });
    const port = createPgLfkTemplatesPort();
    const u = await port.getTemplateUsageSummary("00000000-0000-4000-8000-000000000088");
    expect(u.activePatientLfkAssignmentCount).toBe(2);
    expect(u.publishedTreatmentProgramTemplateCount).toBe(1);
    expect(u.activePatientLfkAssignmentRefs).toHaveLength(1);
    expect(u.activePatientLfkAssignmentRefs[0]?.kind).toBe("patient_lfk_assignment_client");
    expect(u.publishedTreatmentProgramTemplateRefs[0]?.title).toBe("Программа");
  });

  it("updateExercises deletes then inserts in sort order and touches updated_at", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
    const port = createPgLfkTemplatesPort();
    const templateId = "00000000-0000-4000-8000-000000000001";
    await port.updateExercises(templateId, [
      { exerciseId: "00000000-0000-4000-8000-000000000011", sortOrder: 0 },
      { exerciseId: "00000000-0000-4000-8000-000000000012", sortOrder: 1 },
    ]);
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const txSql = runWebappPgTextMock.mock.calls
      .filter((c) => c[2] != null)
      .map((c) => String(c[0]));
    expect(txSql[0]).toContain("DELETE FROM lfk_complex_template_exercises");
    expect(txSql.filter((s) => s.includes("INSERT INTO lfk_complex_template_exercises"))).toHaveLength(2);
    expect(txSql.at(-1)).toContain("UPDATE lfk_complex_templates SET updated_at");
    const insertParams = runWebappPgTextMock.mock.calls
      .filter((c) => String(c[0]).includes("INSERT INTO lfk_complex_template_exercises"))
      .map((c) => c[1] as unknown[]);
    expect(insertParams[0]?.[2]).toBe(0);
    expect(insertParams[1]?.[2]).toBe(1);
  });
});

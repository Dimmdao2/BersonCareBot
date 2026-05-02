import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock, connect: vi.fn() })));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { createPgLfkTemplatesPort } from "./pgLfkTemplates";

describe("createPgLfkTemplatesPort", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("list includes exercise_count subquery", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkTemplatesPort();
    await port.list({ status: "draft" });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("exercise_count");
    expect(sql).toContain("lfk_complex_template_exercises");
  });

  it("list runs lightweight thumbnail query by default when templates exist", async () => {
    queryMock.mockResolvedValueOnce({
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
    queryMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkTemplatesPort();
    await port.list({ status: "draft" });
    expect(queryMock).toHaveBeenCalledTimes(2);
    const thumbSql = String(queryMock.mock.calls[1]?.[0] ?? "");
    expect(thumbSql).toContain("te_ranked");
    expect(thumbSql).toContain("lfk_complex_template_exercises");
    expect(thumbSql).toContain("lfk_exercise_media");
  });

  it("list uses full exercise join query when includeExerciseDetails is true", async () => {
    queryMock.mockResolvedValueOnce({
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
    queryMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkTemplatesPort();
    await port.list({ status: "draft", includeExerciseDetails: true });
    expect(queryMock).toHaveBeenCalledTimes(2);
    const sql = String(queryMock.mock.calls[1]?.[0] ?? "");
    expect(sql).toContain("exercise_title");
    expect(sql).not.toContain("te_ranked");
  });

  it("getTemplateUsageSummary runs usage aggregate query", async () => {
    queryMock.mockResolvedValueOnce({
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
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("lfk_complex");
    expect(sql).toContain("patient_lfk_assignments");
  });

  it("getTemplateUsageSummary parses non-empty ref aggregates", async () => {
    queryMock.mockResolvedValueOnce({
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
});

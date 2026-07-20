import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const runWebappTransactionMock = vi.hoisted(() => vi.fn());
const getCurrentOrganizationIdMock = vi.hoisted(() => vi.fn());

vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentOrganizationIdMock,
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
  runWebappTransaction: runWebappTransactionMock,
}));

import { createPgLfkTemplatesPort } from "./pgLfkTemplates";

const templateId = "00000000-0000-4000-8000-000000000001";

function templateHeaderRow(overrides: Partial<{ id: string; title: string; status: string }> = {}) {
  return {
    id: templateId,
    owner_kind: "organization",
    title: "T",
    description: null,
    status: "draft",
    created_by: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("createPgLfkTemplatesPort", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappTransactionMock.mockReset();
    getCurrentOrganizationIdMock.mockReset();
    getCurrentOrganizationIdMock.mockReturnValue("a0000000-0000-4000-8000-000000000001");
    runWebappTransactionMock.mockImplementation(async (fn) => fn({ rollback: vi.fn() }));
  });

  it("fails closed when an organization principal is absent", async () => {
    getCurrentOrganizationIdMock.mockReturnValue(null);
    const port = createPgLfkTemplatesPort();
    await expect(port.list({})).rejects.toThrow(/Organization principal/);
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it("list includes exercise_count subquery", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkTemplatesPort();
    await port.list({ status: "draft" });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("exercise_count");
    expect(sql).toContain("lfk_complex_template_exercises");
    expect(sql).toContain("t.organization_id = NULLIF(current_setting('app.org', true), '')::uuid");
  });

  it("keeps platform templates hidden OFF and exposes tagged platform rows ON", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
    const port = createPgLfkTemplatesPort();
    await port.list({});
    const offSql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(offSql).not.toContain("t.owner_kind = 'platform'");

    await port.list({ includePlatformBase: true });
    const onSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
    expect(onSql).toContain("t.owner_kind = 'platform'");
    expect(onSql).toContain("t.organization_id IS NULL");
  });

  it("direct template lookup binds trusted OFF/ON access", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
    const port = createPgLfkTemplatesPort();
    await port.getById(templateId);
    await port.getById(templateId, { includePlatformBase: true });
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([templateId, false]);
    expect(runWebappPgTextMock.mock.calls[1]?.[1]).toEqual([templateId, true]);
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

  it("create inserts template through one webapp transaction", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [templateHeaderRow()] });
    const port = createPgLfkTemplatesPort();
    const out = await port.create({ title: "T" }, null);
    expect(out.id).toBe(templateId);
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const txSql = runWebappPgTextMock.mock.calls
      .filter((c) => c[2] != null)
      .map((c) => String(c[0]))
      .join("\n");
    expect(txSql).toContain("INSERT INTO lfk_complex_templates");
    expect(txSql).toContain("organization_id");
  });

  it("update patches template through one webapp transaction before reloading", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [templateHeaderRow({ title: "New" })] })
      .mockResolvedValueOnce({ rows: [templateHeaderRow({ title: "New" })] })
      .mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkTemplatesPort();
    const out = await port.update(templateId, { title: "New" });
    expect(out?.title).toBe("New");
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const txSql = runWebappPgTextMock.mock.calls
      .filter((c) => c[2] != null)
      .map((c) => String(c[0]))
      .join("\n");
    expect(txSql).toContain("UPDATE lfk_complex_templates SET");
  });

  it("setStatus updates template status through one webapp transaction before reloading", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [templateHeaderRow({ status: "published" })] })
      .mockResolvedValueOnce({ rows: [templateHeaderRow({ status: "published" })] })
      .mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkTemplatesPort();
    const out = await port.setStatus(templateId, "published");
    expect(out?.status).toBe("published");
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const txSql = runWebappPgTextMock.mock.calls
      .filter((c) => c[2] != null)
      .map((c) => String(c[0]))
      .join("\n");
    expect(txSql).toContain("UPDATE lfk_complex_templates SET status");
  });

  it("updateExercises deletes then inserts in sort order and touches updated_at", async () => {
    runWebappPgTextMock.mockImplementation(async (sql: string) => ({
      rows: [],
      rowCount: sql.includes("INSERT INTO lfk_complex_template_exercises") ? 1 : 0,
    }));
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
    expect(txSql.join("\n")).toContain("e.organization_id = NULLIF(current_setting('app.org', true), '')::uuid");
    expect(txSql.at(-1)).toContain("UPDATE lfk_complex_templates SET updated_at");
    const insertParams = runWebappPgTextMock.mock.calls
      .filter((c) => String(c[0]).includes("INSERT INTO lfk_complex_template_exercises"))
      .map((c) => c[1] as unknown[]);
    expect(insertParams[0]?.[2]).toBe(0);
    expect(insertParams[1]?.[2]).toBe(1);
  });

  it("rejects a cross-organization exercise instead of saving a partial template", async () => {
    runWebappPgTextMock.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const port = createPgLfkTemplatesPort();
    await expect(
      port.updateExercises(templateId, [
        { exerciseId: "00000000-0000-4000-8000-000000000099", sortOrder: 0 },
      ]),
    ).rejects.toThrow(/outside the current organization/);
  });
});

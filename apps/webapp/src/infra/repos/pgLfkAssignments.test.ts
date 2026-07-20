import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const runWebappTransactionMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn());
const isMechanicEnabledMock = vi.hoisted(() => vi.fn());

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000010";

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
  runWebappTransaction: runWebappTransactionMock,
}));

vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
}));

vi.mock("@/infra/repos/pgOrgEntitlements", () => ({
  createPgOrgEntitlementsPort: vi.fn(() => ({ marker: "entitlements" })),
}));

vi.mock("@/modules/org-entitlements/service", () => ({
  isMechanicEnabled: isMechanicEnabledMock,
}));

import { createPgLfkAssignmentsPort } from "./pgLfkAssignments";

describe("createPgLfkAssignmentsPort", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappTransactionMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    isMechanicEnabledMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORGANIZATION_ID);
    isMechanicEnabledMock.mockResolvedValue(false);
    runWebappTransactionMock.mockImplementation(async (fn) => fn({ rollback: vi.fn() }));
  });

  it("throws when template is not published", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          id: "t1",
          title: "X",
          status: "draft",
          owner_kind: "organization",
          organization_id: ORGANIZATION_ID,
        },
      ],
    });

    const port = createPgLfkAssignmentsPort();
    await expect(
      port.assignPublishedTemplateToPatient({
        templateId: "t1",
        patientUserId: "00000000-0000-4000-8000-000000000001",
        assignedBy: null,
      }),
    ).rejects.toThrow(/не опубликован/);

    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
  });

  it("keeps platform templates unavailable while the catalog entitlement is off", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });

    const port = createPgLfkAssignmentsPort();
    await expect(
      port.assignPublishedTemplateToPatient({
        templateId: "platform-template",
        patientUserId: "00000000-0000-4000-8000-000000000001",
        assignedBy: null,
      }),
    ).rejects.toThrow(/не опубликован/);

    expect(isMechanicEnabledMock).toHaveBeenCalledWith(
      { marker: "entitlements" },
      ORGANIZATION_ID,
      "exercise_catalog",
    );
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      "platform-template",
      ORGANIZATION_ID,
      false,
    ]);
  });

  it("allows an enabled platform template to be instantiated as a patient-owned snapshot", async () => {
    isMechanicEnabledMock.mockResolvedValueOnce(true);
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "platform-template",
            title: "Базовый шаблон",
            status: "published",
            owner_kind: "platform",
            organization_id: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            exercise_id: "platform-exercise",
            sort_order: 0,
            reps: null,
            sets: null,
            side: null,
            max_pain_0_10: null,
            comment: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "patient-complex" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "patient-assignment" }] });

    const port = createPgLfkAssignmentsPort();
    await expect(
      port.assignPublishedTemplateToPatient({
        templateId: "platform-template",
        patientUserId: "00000000-0000-4000-8000-000000000001",
        assignedBy: null,
      }),
    ).resolves.toEqual({
      assignmentId: "patient-assignment",
      complexId: "patient-complex",
    });

    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      "platform-template",
      ORGANIZATION_ID,
      true,
    ]);
    expect(runWebappPgTextMock.mock.calls[1]?.[1]).toEqual([
      "platform-template",
      "platform",
      null,
    ]);
    expect(runWebappPgTextMock.mock.calls[2]?.[1]).toEqual([
      ORGANIZATION_ID,
      "00000000-0000-4000-8000-000000000001",
      "platform-template",
    ]);
  });

  it("creates new complex and assignment for first assign", async () => {
    const exRow = {
      exercise_id: "e1",
      sort_order: 0,
      reps: null,
      sets: null,
      side: null,
      max_pain_0_10: null,
      comment: null,
    };
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "t1",
            title: "Шаблон",
            status: "published",
            owner_kind: "organization",
            organization_id: ORGANIZATION_ID,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [exRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "cnew" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "anew" }] });

    const port = createPgLfkAssignmentsPort();
    const r = await port.assignPublishedTemplateToPatient({
      templateId: "t1",
      patientUserId: "00000000-0000-4000-8000-000000000001",
      assignedBy: "00000000-0000-4000-8000-000000000002",
    });
    expect(r.complexId).toBe("cnew");
    expect(r.assignmentId).toBe("anew");
    const joined = runWebappPgTextMock.mock.calls.map((c) => String(c[0])).join("\n");
    expect(joined).toContain("lfk_complex_exercises");
    expect(joined).toContain("local_comment");
    expect(joined).toContain("INSERT INTO patient_lfk_assignments");
    expect(joined).toContain("organization_id = $1::uuid");
    expect(runWebappPgTextMock.mock.calls[3]?.[1]).toEqual([
      ORGANIZATION_ID,
      "00000000-0000-4000-8000-000000000001",
      "Шаблон",
    ]);
    expect(runWebappPgTextMock.mock.calls[4]?.[1]?.[0]).toBe(ORGANIZATION_ID);
    expect(runWebappPgTextMock.mock.calls[5]?.[1]).toEqual([
      ORGANIZATION_ID,
      "00000000-0000-4000-8000-000000000001",
      "t1",
      "cnew",
      "00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("updates existing assignment and deactivates prior complex", async () => {
    const exRow = {
      exercise_id: "e1",
      sort_order: 0,
      reps: null,
      sets: null,
      side: null,
      max_pain_0_10: null,
      comment: null,
    };
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "t1",
            title: "Шаблон",
            status: "published",
            owner_kind: "organization",
            organization_id: ORGANIZATION_ID,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [exRow] })
      .mockResolvedValueOnce({ rows: [{ id: "asg-old", complex_id: "cold" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "cnew" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "asg-old" }] });

    const port = createPgLfkAssignmentsPort();
    const r = await port.assignPublishedTemplateToPatient({
      templateId: "t1",
      patientUserId: "00000000-0000-4000-8000-000000000001",
      assignedBy: null,
    });
    expect(r.assignmentId).toBe("asg-old");
    expect(r.complexId).toBe("cnew");
    const joined = runWebappPgTextMock.mock.calls.map((c) => String(c[0])).join("\n");
    expect(joined).toContain("UPDATE lfk_complexes");
    expect(joined).toContain("SET is_active = false");
    expect(joined).toContain("UPDATE patient_lfk_assignments");
    expect(runWebappPgTextMock.mock.calls[3]?.[1]).toEqual(["cold", ORGANIZATION_ID]);
    expect(runWebappPgTextMock.mock.calls[6]?.[1]).toEqual([
      "cnew",
      null,
      "asg-old",
      ORGANIZATION_ID,
    ]);
  });

  it("fails closed when an existing assignment cannot be updated inside the current organization", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "t1",
            title: "Шаблон",
            status: "published",
            owner_kind: "organization",
            organization_id: ORGANIZATION_ID,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            exercise_id: "e1",
            sort_order: 0,
            reps: null,
            sets: null,
            side: null,
            max_pain_0_10: null,
            comment: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "asg-old", complex_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: "cnew" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgLfkAssignmentsPort();
    await expect(
      port.assignPublishedTemplateToPatient({
        templateId: "t1",
        patientUserId: "00000000-0000-4000-8000-000000000001",
        assignedBy: null,
      }),
    ).rejects.toThrow("lfk_assignment_owner_mismatch");

    const updateSql = String(runWebappPgTextMock.mock.calls[5]?.[0] ?? "");
    expect(updateSql).toContain("WHERE id = $3 AND organization_id = $4::uuid");
  });

  it("aborts assign when template has no exercises", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "t1",
            title: "Шаблон",
            status: "published",
            owner_kind: "organization",
            organization_id: ORGANIZATION_ID,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgLfkAssignmentsPort();
    await expect(
      port.assignPublishedTemplateToPatient({
        templateId: "t1",
        patientUserId: "00000000-0000-4000-8000-000000000001",
        assignedBy: null,
      }),
    ).rejects.toThrow(/нет упражнений/);
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
  });
});

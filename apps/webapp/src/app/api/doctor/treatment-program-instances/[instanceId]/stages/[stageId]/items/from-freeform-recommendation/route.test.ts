/**
 * Тесты HTTP-слоя с моками DI. Семантику «только этап sort_order === 0» см. в проде:
 * `doctorAddFreeformRecommendationToStageZero` и `instance-service.test.ts` (in-memory порт).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const freeformMock = vi.fn();
const getInstanceByIdMock = vi.fn();
const getClientIdentityMock = vi.fn();

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}));

vi.mock("@/app-layer/cache/revalidatePatientTreatmentProgramUi", () => ({
  revalidatePatientTreatmentProgramUi: vi.fn(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: {
      getInstanceById: getInstanceByIdMock,
      doctorAddFreeformRecommendationToStageZero: freeformMock,
    },
    doctorClientsPort: {
      getClientIdentity: getClientIdentityMock,
    },
  }),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
    if (!fn) throw new Error("principal_callback_required");
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));

import { POST } from "./route";

const INSTANCE_ID = "11111111-1111-4111-8111-111111111111";
/** В успешных кейсах считаем этот id этапом 0 в ответе сервиса. */
const STAGE_ZERO_ID = "22222222-2222-4222-8222-222222222222";
/** Другой этап (например sort_order > 0) — в URL запроса. */
const STAGE_NON_ZERO_ID = "44444444-4444-4444-8444-444444444444";
const PATIENT_ID = "33333333-3333-4333-8333-333333333333";
const DOCTOR_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const workspaceCtx = {
  session: { user: { userId: DOCTOR_ID, role: "doctor", bindings: {} } },
  organizationId: "55555555-5555-4555-8555-555555555555",
  membershipId: "66666666-6666-4666-8666-666666666666",
  membershipRole: "doctor",
  specialistId: null,
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

function postRequest(body: unknown, stageIdInUrl: string = STAGE_ZERO_ID) {
  return POST(
    new Request(
      `http://localhost/api/doctor/treatment-program-instances/${INSTANCE_ID}/stages/${stageIdInUrl}/items/from-freeform-recommendation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ instanceId: INSTANCE_ID, stageId: stageIdInUrl }) },
  );
}

describe("POST .../from-freeform-recommendation", () => {
  beforeEach(() => {
    freeformMock.mockReset();
    getInstanceByIdMock.mockReset();
    getClientIdentityMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    getInstanceByIdMock.mockResolvedValue({
      id: INSTANCE_ID,
      organizationId: workspaceCtx.organizationId,
      patientUserId: PATIENT_ID,
      templateId: null,
      title: "План",
      status: "active",
      assignedBy: null,
      createdAt: "",
      updatedAt: "",
      patientPlanLastOpenedAt: null,
      stages: [],
    });
    getClientIdentityMock.mockResolvedValue({
      userId: PATIENT_ID,
      displayName: "P",
      phone: "+70000000000",
      bindings: {},
      createdAt: null,
      isBlocked: false,
      blockedReason: null,
      isArchived: false,
    });
  });

  it("success", async () => {
    freeformMock.mockResolvedValue({
      item: { id: "item-1", itemType: "recommendation" },
      recommendationId: "rec-1",
    });
    const res = await postRequest({ title: "T", bodyMd: "Body" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; recommendationId?: string };
    expect(body.ok).toBe(true);
    expect(body.recommendationId).toBe("rec-1");
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(workspaceCtx, expect.any(Function));
    expect(freeformMock).toHaveBeenCalledWith({
      instanceId: INSTANCE_ID,
      stageId: STAGE_ZERO_ID,
      actorId: DOCTOR_ID,
      title: "T",
      bodyMd: "Body",
    });
  });

  it("invalid_body без title", async () => {
    const res = await postRequest({ title: "", bodyMd: "x" });
    expect(res.status).toBe(400);
    expect(freeformMock).not.toHaveBeenCalled();
  });

  it("401 без сессии", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await postRequest({ title: "T", bodyMd: "x" });
    expect(res.status).toBe(401);
    expect(freeformMock).not.toHaveBeenCalled();
  });

  it("403 для роли без доступа к кабинету врача", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });
    const res = await postRequest({ title: "T", bodyMd: "x" });
    expect(res.status).toBe(403);
    expect(freeformMock).not.toHaveBeenCalled();
  });

  it("404 если экземпляр не найден", async () => {
    getInstanceByIdMock.mockResolvedValueOnce(null);
    const res = await postRequest({ title: "T", bodyMd: "x" });
    expect(res.status).toBe(404);
    expect(freeformMock).not.toHaveBeenCalled();
  });

  it("404 если пациент недоступен в контексте врача", async () => {
    getClientIdentityMock.mockResolvedValueOnce(null);
    const res = await postRequest({ title: "T", bodyMd: "x" });
    expect(res.status).toBe(404);
    expect(freeformMock).not.toHaveBeenCalled();
  });

  it("400 если этап не этап 0 (чужой stageId в URL → сервис отклоняет)", async () => {
    freeformMock.mockImplementation(async (input: { stageId: string }) => {
      if (input.stageId !== STAGE_ZERO_ID) {
        throw new Error("Свободный текст можно добавить только на этап «Общие рекомендации»");
      }
      return {
        item: { id: "item-1", itemType: "recommendation" as const },
        recommendationId: "rec-1",
      };
    });
    const res = await postRequest({ title: "T", bodyMd: "x" }, STAGE_NON_ZERO_ID);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Общие рекомендации/);
    expect(freeformMock).toHaveBeenCalledWith(
      expect.objectContaining({ stageId: STAGE_NON_ZERO_ID }),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const getInstanceByIdMock = vi.fn();
const doctorApplyInstanceEditorBatchMock = vi.fn();
const getClientIdentityMock = vi.fn();

const getCurrentSessionMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    user: { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "doctor", bindings: {} },
  }),
);

vi.mock("@/app-layer/cache/revalidatePatientTreatmentProgramUi", () => ({
  revalidatePatientTreatmentProgramUi: vi.fn(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: {
      getInstanceById: getInstanceByIdMock,
      doctorApplyInstanceEditorBatch: doctorApplyInstanceEditorBatchMock,
    },
    doctorClientsPort: {
      getClientIdentity: getClientIdentityMock,
    },
  }),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
}));

vi.mock("@/modules/roles/service", () => ({
  canAccessDoctor: (role: string) => role === "doctor",
}));

import { POST } from "./route";

const instanceId = "11111111-1111-4111-8111-111111111111";
const patientUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const emptyDraft = {
  stageMetadata: {},
  groupPatches: {},
  itemPatches: {},
  stageOrder: null,
  stageCreates: [],
  groupCreates: [],
  itemCreates: [],
  itemDeletes: {},
  itemReorders: {},
  groupReorders: {},
  groupHides: {},
  itemStructuralPatches: {},
};

describe("POST .../editor-batch", () => {
  beforeEach(() => {
    getInstanceByIdMock.mockReset();
    doctorApplyInstanceEditorBatchMock.mockReset();
    getClientIdentityMock.mockReset();
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "doctor", bindings: {} },
    });
    getInstanceByIdMock.mockResolvedValue({ id: instanceId, patientUserId });
    getClientIdentityMock.mockResolvedValue({ userId: patientUserId, displayName: "Пациент" });
    doctorApplyInstanceEditorBatchMock.mockResolvedValue({ id: instanceId, patientUserId, stages: [] });
  });

  it("401 without session", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: emptyDraft }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(401);
  });

  it("400 on invalid body", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notDraft: true }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(400);
  });

  it("applies batch draft", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: emptyDraft }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(200);
    expect(doctorApplyInstanceEditorBatchMock).toHaveBeenCalledWith({
      instanceId,
      actorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      draft: emptyDraft,
    });
  });

  it("403 for non-doctor role", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", role: "client", bindings: {} },
    });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: emptyDraft }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(403);
    expect(doctorApplyInstanceEditorBatchMock).not.toHaveBeenCalled();
  });

  it("404 when instance not found", async () => {
    getInstanceByIdMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: emptyDraft }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(404);
    expect(doctorApplyInstanceEditorBatchMock).not.toHaveBeenCalled();
  });

  it("400 when apply throws catalog unavailable", async () => {
    doctorApplyInstanceEditorBatchMock.mockRejectedValue(
      new Error("Объект для типа «exercise» не найден или недоступен"),
    );
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: emptyDraft }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(400);
  });

  it("404 when patient is not in doctor clients", async () => {
    getClientIdentityMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: emptyDraft }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(404);
    expect(doctorApplyInstanceEditorBatchMock).not.toHaveBeenCalled();
  });
});

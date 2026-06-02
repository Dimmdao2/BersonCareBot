import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  gateMock,
  buildAppDepsMock,
  getSettingMock,
  getInstanceForPatientMock,
  markReadMock,
  getPatientProgramInteractionPolicyMock,
} = vi.hoisted(() => {
  const getSettingMockInner = vi.fn();
  const getInstanceForPatientMockInner = vi.fn();
  const markReadMockInner = vi.fn();
  const getPatientProgramInteractionPolicyMockInner = vi.fn();
  return {
    gateMock: vi.fn(),
    getSettingMock: getSettingMockInner,
    getInstanceForPatientMock: getInstanceForPatientMockInner,
    markReadMock: markReadMockInner,
    getPatientProgramInteractionPolicyMock: getPatientProgramInteractionPolicyMockInner,
    buildAppDepsMock: vi.fn(() => ({
      systemSettings: { getSetting: getSettingMockInner },
      doctorClients: {
        getPatientProgramInteractionPolicy: getPatientProgramInteractionPolicyMockInner,
      },
      treatmentProgramInstance: { getInstanceForPatient: getInstanceForPatientMockInner },
      programItemDiscussion: { markRead: markReadMockInner },
    })),
  };
});

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: gateMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { POST } from "./route";

const instanceId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const patientUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("POST discussion/read", () => {
  beforeEach(() => {
    gateMock.mockReset();
    getSettingMock.mockReset();
    getInstanceForPatientMock.mockReset();
    markReadMock.mockReset();
    getPatientProgramInteractionPolicyMock.mockReset();

    gateMock.mockResolvedValue({
      ok: true as const,
      session: {
        user: {
          userId: patientUserId,
          role: "client" as const,
          phone: "+79990001122",
          bindings: {},
        },
      },
    });
    getSettingMock.mockResolvedValue({ valueJson: { value: true } });
    getPatientProgramInteractionPolicyMock.mockResolvedValue({
      onSupport: true,
      commentsAllowed: true,
      mediaAllowed: true,
    });
    getInstanceForPatientMock.mockResolvedValue({
      id: instanceId,
      assignmentSource: "doctor",
      stages: [{ items: [{ id: itemId }] }],
    });
    markReadMock.mockResolvedValue(undefined);
  });

  it("marks item discussion as read", async () => {
    const res = await POST(
      new Request(
        `http://localhost/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/discussion/read`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(res.status).toBe(200);
    expect(markReadMock).toHaveBeenCalledWith({
      patientUserId,
      stageItemId: itemId,
    });
  });

  it("returns 403 when feature disabled", async () => {
    getSettingMock.mockResolvedValue({ valueJson: { value: false } });
    const res = await POST(
      new Request(
        `http://localhost/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/discussion/read`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(res.status).toBe(403);
  });
});

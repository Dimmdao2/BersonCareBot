import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  gateMock,
  buildAppDepsMock,
  getSettingMock,
  getInstanceForPatientMock,
  markReadMock,
  listLinkedSupportMessageIdsForStageItemMock,
  markInboundMessagesReadForUserMock,
  getPatientProgramInteractionPolicyMock,
} = vi.hoisted(() => {
  const getSettingMockInner = vi.fn();
  const getInstanceForPatientMockInner = vi.fn();
  const markReadMockInner = vi.fn();
  const listLinkedSupportMessageIdsForStageItemMockInner = vi.fn();
  const markInboundMessagesReadForUserMockInner = vi.fn();
  const getPatientProgramInteractionPolicyMockInner = vi.fn();
  return {
    gateMock: vi.fn(),
    getSettingMock: getSettingMockInner,
    getInstanceForPatientMock: getInstanceForPatientMockInner,
    markReadMock: markReadMockInner,
    listLinkedSupportMessageIdsForStageItemMock: listLinkedSupportMessageIdsForStageItemMockInner,
    markInboundMessagesReadForUserMock: markInboundMessagesReadForUserMockInner,
    getPatientProgramInteractionPolicyMock: getPatientProgramInteractionPolicyMockInner,
    buildAppDepsMock: vi.fn(() => ({
      systemSettings: { getSetting: getSettingMockInner },
      doctorClients: {
        getPatientProgramInteractionPolicy: getPatientProgramInteractionPolicyMockInner,
      },
      treatmentProgramInstance: { getInstanceForPatient: getInstanceForPatientMockInner },
      programItemDiscussion: {
        markRead: markReadMockInner,
        listLinkedSupportMessageIdsForStageItem: listLinkedSupportMessageIdsForStageItemMockInner,
      },
      supportCommunication: {
        markInboundMessagesReadForUser: markInboundMessagesReadForUserMockInner,
      },
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
    listLinkedSupportMessageIdsForStageItemMock.mockReset();
    markInboundMessagesReadForUserMock.mockReset();
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
    listLinkedSupportMessageIdsForStageItemMock.mockResolvedValue([]);
    markInboundMessagesReadForUserMock.mockResolvedValue(undefined);
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

  it("syncs related support inbound messages as read", async () => {
    const linkedMessageIds = [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    listLinkedSupportMessageIdsForStageItemMock.mockResolvedValue(linkedMessageIds);
    const res = await POST(
      new Request(
        `http://localhost/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/discussion/read`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(res.status).toBe(200);
    expect(markInboundMessagesReadForUserMock).toHaveBeenCalledWith(patientUserId, linkedMessageIds);
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

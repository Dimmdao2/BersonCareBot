import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  gateMock,
  buildAppDepsMock,
  getSettingMock,
  getInstanceForPatientMock,
  listMessagesForStageItemMock,
  appendDiscussionMediaMock,
  getMediaRowMock,
} = vi.hoisted(() => {
  const getSettingMockInner = vi.fn();
  const getInstanceForPatientMockInner = vi.fn();
  const listMessagesForStageItemMockInner = vi.fn();
  const appendDiscussionMediaMockInner = vi.fn();
  const getMediaRowMockInner = vi.fn();
  return {
    gateMock: vi.fn(),
    getSettingMock: getSettingMockInner,
    getInstanceForPatientMock: getInstanceForPatientMockInner,
    listMessagesForStageItemMock: listMessagesForStageItemMockInner,
    appendDiscussionMediaMock: appendDiscussionMediaMockInner,
    getMediaRowMock: getMediaRowMockInner,
    buildAppDepsMock: vi.fn(() => ({
      systemSettings: { getSetting: getSettingMockInner },
      treatmentProgramInstance: { getInstanceForPatient: getInstanceForPatientMockInner },
      programItemDiscussion: {
        listMessagesForStageItem: listMessagesForStageItemMockInner,
      },
      treatmentProgramPatientActions: {
        patientAppendDiscussionMedia: appendDiscussionMediaMockInner,
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
vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  getMediaRowForProgramSubmissionAttach: (...a: unknown[]) => getMediaRowMock(...a),
}));

import { POST } from "./route";

const instanceId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const mediaFileId = "33333333-3333-4333-8333-333333333333";
const patientUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function okGate() {
  return {
    ok: true as const,
    session: {
      user: {
        userId: patientUserId,
        role: "client" as const,
        phone: "+79990001122",
        bindings: {},
      },
    },
  };
}

describe("POST .../discussion/media", () => {
  beforeEach(() => {
    gateMock.mockReset();
    buildAppDepsMock.mockClear();
    getSettingMock.mockReset();
    getInstanceForPatientMock.mockReset();
    listMessagesForStageItemMock.mockReset();
    appendDiscussionMediaMock.mockReset();
    getMediaRowMock.mockReset();

    gateMock.mockResolvedValue(okGate());
    getSettingMock.mockResolvedValue({ valueJson: { value: true } });
    getInstanceForPatientMock.mockResolvedValue({
      id: instanceId,
      assignmentSource: "doctor",
      stages: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          items: [{ id: itemId, snapshot: { title: "Упражнение" } }],
        },
      ],
    });
    getMediaRowMock.mockResolvedValue({ id: mediaFileId, status: "ready" });
    appendDiscussionMediaMock.mockResolvedValue(undefined);
    listMessagesForStageItemMock
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          instanceStageItemId: itemId,
          patientUserId,
          senderRole: "patient",
          origin: "patient_observation",
          body: null,
          mediaFileId,
          supportMessageId: null,
          createdAt: "2026-05-30T12:00:00.000Z",
        },
      ]);
  });

  it("returns 403 when media flow disabled", async () => {
    getSettingMock.mockResolvedValue({ valueJson: { value: false } });
    const res = await POST(
      new Request(`http://localhost/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/discussion/media`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaFileId }),
      }),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(res.status).toBe(403);
  });

  it("attaches ready media and returns latest message", async () => {
    const res = await POST(
      new Request(`http://localhost/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/discussion/media`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaFileId }),
      }),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(res.status).toBe(200);
    expect(appendDiscussionMediaMock).toHaveBeenCalledWith({
      patientUserId,
      instanceId,
      stageItemId: itemId,
      mediaFileId,
    });
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message?.mediaFileId).toBe(mediaFileId);
  });
});

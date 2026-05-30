import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  gateMock,
  buildAppDepsMock,
  getConversationIfOwnedByUserMock,
  getSettingMock,
  listUnreadInboundMock,
  syncDiscussionReadMock,
  markInboundReadMock,
} = vi.hoisted(() => {
  const getConversationIfOwnedByUserMockInner = vi.fn();
  const getSettingMockInner = vi.fn();
  const listUnreadInboundMockInner = vi.fn();
  const syncDiscussionReadMockInner = vi.fn();
  const markInboundReadMockInner = vi.fn();
  return {
    gateMock: vi.fn(),
    getConversationIfOwnedByUserMock: getConversationIfOwnedByUserMockInner,
    getSettingMock: getSettingMockInner,
    listUnreadInboundMock: listUnreadInboundMockInner,
    syncDiscussionReadMock: syncDiscussionReadMockInner,
    markInboundReadMock: markInboundReadMockInner,
    buildAppDepsMock: vi.fn(() => ({
      supportCommunication: {
        getConversationIfOwnedByUser: getConversationIfOwnedByUserMockInner,
        listUnreadInboundAdminMessagesForUser: listUnreadInboundMockInner,
      },
      systemSettings: { getSetting: getSettingMockInner },
      programItemDiscussion: {
        syncDiscussionReadFromSupportInboundMessages: syncDiscussionReadMockInner,
      },
      messaging: {
        patient: {
          markInboundRead: markInboundReadMockInner,
        },
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

const conversationId = "11111111-1111-4111-8111-111111111111";
const patientUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const supportMessageId = "22222222-2222-4222-8222-222222222222";

describe("POST patient messages/read", () => {
  beforeEach(() => {
    gateMock.mockReset();
    getConversationIfOwnedByUserMock.mockReset();
    getSettingMock.mockReset();
    listUnreadInboundMock.mockReset();
    syncDiscussionReadMock.mockReset();
    markInboundReadMock.mockReset();

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
    getConversationIfOwnedByUserMock.mockResolvedValue({ id: conversationId });
    getSettingMock.mockResolvedValue({ valueJson: { value: true } });
    listUnreadInboundMock.mockResolvedValue([{ id: supportMessageId, text: "Ответ..." }]);
    syncDiscussionReadMock.mockResolvedValue({ markedStageItemIds: ["33333333-3333-4333-8333-333333333333"], skippedAmbiguous: 0 });
    markInboundReadMock.mockResolvedValue(undefined);
  });

  it("syncs program discussion read before marking support inbound read", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      }),
    );
    expect(res.status).toBe(200);
    expect(listUnreadInboundMock).toHaveBeenCalledWith(patientUserId);
    expect(syncDiscussionReadMock).toHaveBeenCalledWith({
      patientUserId,
      inboundAdminMessages: [{ id: supportMessageId, text: "Ответ..." }],
    });
    expect(markInboundReadMock).toHaveBeenCalledWith(patientUserId, conversationId);
  });

  it("skips discussion sync when feature disabled", async () => {
    getSettingMock.mockResolvedValue({ valueJson: { value: false } });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      }),
    );
    expect(res.status).toBe(200);
    expect(syncDiscussionReadMock).not.toHaveBeenCalled();
    expect(markInboundReadMock).toHaveBeenCalled();
  });
});

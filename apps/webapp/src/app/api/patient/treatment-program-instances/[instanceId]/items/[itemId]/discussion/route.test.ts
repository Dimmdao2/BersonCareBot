import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

type DiscussionMsg = {
  id: string;
  instanceStageItemId: string;
  patientUserId: string;
  senderRole: string;
  origin: string;
  body: string | null;
  mediaFileId: string | null;
  supportMessageId: string | null;
  createdAt: string;
};

function compareMsgs(a: Pick<DiscussionMsg, "createdAt" | "id">, b: Pick<DiscussionMsg, "createdAt" | "id">) {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

const {
  gateMock,
  buildAppDepsMock,
  getSettingMock,
  getInstanceForPatientMock,
  listMessagesForStageItemMock,
  listMessagesPageMock,
  mergeLegacyAdminRepliesMock,
  countMessagesForItemMock,
  countLegacyAdminRepliesMock,
  listLinkedSupportMessageIdsMock,
  getUnreadCountMock,
  listActionLogForInstanceMock,
  appendObservationNoteMock,
  getPatientProgramInteractionPolicyMock,
  listActiveStaffUserIdsMock,
  getMaxLastReadAtForViewersMock,
} = vi.hoisted(() => {
  const getPatientProgramInteractionPolicyMockInner = vi.fn();
  const getSettingMockInner = vi.fn();
  const getInstanceForPatientMockInner = vi.fn();
  const listMessagesForStageItemMockInner = vi.fn();
  const listMessagesPageMockInner = vi.fn();
  const mergeLegacyAdminRepliesMockInner = vi.fn();
  const countMessagesForItemMockInner = vi.fn();
  const countLegacyAdminRepliesMockInner = vi.fn();
  const listLinkedSupportMessageIdsMockInner = vi.fn();
  const getUnreadCountMockInner = vi.fn();
  const listActionLogForInstanceMockInner = vi.fn();
  const appendObservationNoteMockInner = vi.fn();
  const listActiveStaffUserIdsMockInner = vi.fn();
  const getMaxLastReadAtForViewersMockInner = vi.fn();
  return {
    gateMock: vi.fn(),
    getSettingMock: getSettingMockInner,
    getInstanceForPatientMock: getInstanceForPatientMockInner,
    listMessagesForStageItemMock: listMessagesForStageItemMockInner,
    listMessagesPageMock: listMessagesPageMockInner,
    mergeLegacyAdminRepliesMock: mergeLegacyAdminRepliesMockInner,
    countMessagesForItemMock: countMessagesForItemMockInner,
    countLegacyAdminRepliesMock: countLegacyAdminRepliesMockInner,
    listLinkedSupportMessageIdsMock: listLinkedSupportMessageIdsMockInner,
    getUnreadCountMock: getUnreadCountMockInner,
    listActionLogForInstanceMock: listActionLogForInstanceMockInner,
    appendObservationNoteMock: appendObservationNoteMockInner,
    getPatientProgramInteractionPolicyMock: getPatientProgramInteractionPolicyMockInner,
    listActiveStaffUserIdsMock: listActiveStaffUserIdsMockInner,
    getMaxLastReadAtForViewersMock: getMaxLastReadAtForViewersMockInner,
    buildAppDepsMock: vi.fn(() => ({
      systemSettings: { getSetting: getSettingMockInner },
      doctorClients: {
        getPatientProgramInteractionPolicy: getPatientProgramInteractionPolicyMockInner,
      },
      treatmentProgramInstance: { getInstanceForPatient: getInstanceForPatientMockInner },
      programItemDiscussion: {
        listMessagesForStageItem: listMessagesForStageItemMockInner,
        listMessagesPage: listMessagesPageMockInner,
        mergeLegacyAdminReplies: mergeLegacyAdminRepliesMockInner,
        countMessagesForItem: countMessagesForItemMockInner,
        countLegacyAdminRepliesForStageItem: countLegacyAdminRepliesMockInner,
        listLinkedSupportMessageIdsForStageItem: listLinkedSupportMessageIdsMockInner,
        getUnreadCount: getUnreadCountMockInner,
        getMaxLastReadAtForViewers: getMaxLastReadAtForViewersMockInner,
      },
      staffUsers: { listActiveStaffUserIds: listActiveStaffUserIdsMockInner },
      programActionLog: { listForInstance: listActionLogForInstanceMockInner },
      treatmentProgramPatientActions: {
        patientAppendObservationNote: appendObservationNoteMockInner,
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

import { GET, POST } from "./route";

const instanceId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
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

describe("patient item discussion route", () => {
  beforeEach(() => {
    gateMock.mockReset();
    buildAppDepsMock.mockClear();
    getSettingMock.mockReset();
    getInstanceForPatientMock.mockReset();
    listMessagesForStageItemMock.mockReset();
    listMessagesPageMock.mockReset();
    mergeLegacyAdminRepliesMock.mockReset();
    countMessagesForItemMock.mockReset();
    countLegacyAdminRepliesMock.mockReset();
    listLinkedSupportMessageIdsMock.mockReset();
    getUnreadCountMock.mockReset();
    listActionLogForInstanceMock.mockReset();
    appendObservationNoteMock.mockReset();
    getPatientProgramInteractionPolicyMock.mockReset();
    listActiveStaffUserIdsMock.mockReset();
    getMaxLastReadAtForViewersMock.mockReset();

    gateMock.mockResolvedValue(okGate());
    getSettingMock.mockResolvedValue({ valueJson: { value: true } });
    getPatientProgramInteractionPolicyMock.mockResolvedValue({
      onSupport: true,
      commentsAllowed: true,
      mediaAllowed: true,
    });
    getInstanceForPatientMock.mockResolvedValue({
      id: instanceId,
      assignmentSource: "doctor",
      stages: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          items: [
            {
              id: itemId,
              snapshot: { title: "Упражнение" },
            },
          ],
        },
      ],
    });
    getUnreadCountMock.mockResolvedValue(2);
    listActiveStaffUserIdsMock.mockResolvedValue([]);
    getMaxLastReadAtForViewersMock.mockResolvedValue(null);
    listActionLogForInstanceMock.mockResolvedValue([
      {
        instanceStageItemId: itemId,
        actionType: "done",
        createdAt: "2026-05-30T10:03:00.000Z",
        payload: { source: "simple_item_complete" },
      },
    ]);
  });

  it("GET paginates backward with stable ordering and cursor boundaries", async () => {
    const dbMessages: DiscussionMsg[] = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        instanceStageItemId: itemId,
        patientUserId,
        senderRole: "patient",
        origin: "patient_observation",
        body: "msg-1",
        mediaFileId: null,
        supportMessageId: null,
        createdAt: "2026-05-30T10:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        instanceStageItemId: itemId,
        patientUserId,
        senderRole: "admin",
        origin: "support_admin_reply",
        body: "msg-3",
        mediaFileId: null,
        supportMessageId: "90000000-0000-4000-8000-000000000003",
        createdAt: "2026-05-30T10:02:00.000Z",
      },
    ];
    listMessagesForStageItemMock.mockResolvedValue(dbMessages);
    listMessagesPageMock.mockImplementation(async (input: {
      limit: number;
      direction: "backward" | "forward";
      cursor: { createdAt: string; id: string } | null;
    }) => {
      const sorted = [...dbMessages].sort(compareMsgs);
      if (input.direction === "forward") {
        let start = 0;
        if (input.cursor) {
          while (start < sorted.length && compareMsgs(sorted[start]!, input.cursor) <= 0) start += 1;
        }
        return sorted.slice(start, start + input.limit);
      }
      let endExclusive = sorted.length;
      if (input.cursor) {
        endExclusive = 0;
        while (endExclusive < sorted.length && compareMsgs(sorted[endExclusive]!, input.cursor) < 0) {
          endExclusive += 1;
        }
      }
      const start = Math.max(0, endExclusive - input.limit);
      return sorted.slice(start, endExclusive);
    });
    countMessagesForItemMock.mockResolvedValue(2);
    countLegacyAdminRepliesMock.mockResolvedValue(1);
    listLinkedSupportMessageIdsMock.mockResolvedValue(["90000000-0000-4000-8000-000000000003"]);
    mergeLegacyAdminRepliesMock.mockResolvedValue([
      {
        id: "legacy:90000000-0000-4000-8000-000000000002",
        instanceStageItemId: itemId,
        patientUserId,
        senderRole: "admin",
        origin: "support_admin_reply",
        body: "msg-2",
        mediaFileId: null,
        supportMessageId: "90000000-0000-4000-8000-000000000002",
        createdAt: "2026-05-30T10:01:00.000Z",
      },
    ]);

    const first = await GET(
      new Request(
        `http://localhost/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/discussion?limit=2`,
      ),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(first.status).toBe(200);
    const firstJson = (await first.json()) as {
      ok: boolean;
      messages: Array<{ id: string; body: string | null }>;
      pageInfo: { nextCursor: string | null; hasMore: boolean };
      totalCount: number;
    };
    expect(firstJson.ok).toBe(true);
    expect(firstJson.messages.map((m) => m.body)).toEqual(["msg-2", "msg-3"]);
    expect(firstJson.totalCount).toBe(3);
    expect(firstJson.pageInfo.hasMore).toBe(true);
    expect(typeof firstJson.pageInfo.nextCursor).toBe("string");

    const second = await GET(
      new Request(
        `http://localhost/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/discussion?limit=2&cursor=${encodeURIComponent(firstJson.pageInfo.nextCursor!)}`,
      ),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(second.status).toBe(200);
    const secondJson = (await second.json()) as {
      messages: Array<{ body: string | null }>;
      pageInfo: { hasMore: boolean };
    };
    expect(secondJson.messages.map((m) => m.body)).toEqual(["msg-1"]);
    expect(secondJson.pageInfo.hasMore).toBe(false);
  });

  it("GET rejects malformed cursor", async () => {
    listMessagesForStageItemMock.mockResolvedValue([]);
    listMessagesPageMock.mockResolvedValue([]);
    countMessagesForItemMock.mockResolvedValue(0);
    countLegacyAdminRepliesMock.mockResolvedValue(0);
    listLinkedSupportMessageIdsMock.mockResolvedValue([]);
    mergeLegacyAdminRepliesMock.mockResolvedValue([]);

    const res = await GET(
      new Request(
        `http://localhost/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/discussion?cursor=not-a-cursor`,
      ),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("invalid_cursor");
  });

  it("POST proxies comment through observation dual-write path", async () => {
    const posted: DiscussionMsg = {
      id: "00000000-0000-4000-8000-000000000099",
      instanceStageItemId: itemId,
      patientUserId,
      senderRole: "patient",
      origin: "patient_observation",
      body: "Новый комментарий",
      mediaFileId: null,
      supportMessageId: null,
      createdAt: "2026-05-30T10:09:00.000Z",
    };
    appendObservationNoteMock.mockResolvedValue(posted);
    listMessagesPageMock.mockResolvedValue([posted]);
    listMessagesForStageItemMock.mockResolvedValue([
      posted,
    ]);

    const res = await POST(
      new Request(
        `http://localhost/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/discussion`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: "Новый комментарий" }),
        },
      ),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(res.status).toBe(200);
    expect(appendObservationNoteMock).toHaveBeenCalledWith({
      patientUserId,
      instanceId,
      stageItemId: itemId,
      note: "Новый комментарий",
    });
    const data = (await res.json()) as { ok?: boolean; message?: { id?: string } | null };
    expect(data.ok).toBe(true);
    expect(data.message?.id).toBe("00000000-0000-4000-8000-000000000099");
  });

  it("returns 403 when support policy disables comments", async () => {
    getPatientProgramInteractionPolicyMock.mockResolvedValue({
      onSupport: false,
      commentsAllowed: false,
      mediaAllowed: false,
    });

    const res = await POST(
      new Request(
        `http://localhost/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/discussion`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: "blocked" }),
        },
      ),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(res.status).toBe(403);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("patient_support_comments_disabled");
    expect(appendObservationNoteMock).not.toHaveBeenCalled();
  });

  it("returns 401 when gate rejects", async () => {
    gateMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET(
      new Request(
        `http://localhost/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/discussion`,
      ),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(res.status).toBe(401);
  });
});

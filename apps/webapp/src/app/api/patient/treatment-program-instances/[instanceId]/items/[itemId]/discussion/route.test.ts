import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const {
  gateMock,
  buildAppDepsMock,
  getSettingMock,
  getInstanceForPatientMock,
  listMessagesForStageItemMock,
  mergeLegacyAdminRepliesMock,
  getUnreadCountMock,
  listActionLogForInstanceMock,
  appendObservationNoteMock,
} = vi.hoisted(() => {
  const getSettingMockInner = vi.fn();
  const getInstanceForPatientMockInner = vi.fn();
  const listMessagesForStageItemMockInner = vi.fn();
  const mergeLegacyAdminRepliesMockInner = vi.fn();
  const getUnreadCountMockInner = vi.fn();
  const listActionLogForInstanceMockInner = vi.fn();
  const appendObservationNoteMockInner = vi.fn();
  return {
    gateMock: vi.fn(),
    getSettingMock: getSettingMockInner,
    getInstanceForPatientMock: getInstanceForPatientMockInner,
    listMessagesForStageItemMock: listMessagesForStageItemMockInner,
    mergeLegacyAdminRepliesMock: mergeLegacyAdminRepliesMockInner,
    getUnreadCountMock: getUnreadCountMockInner,
    listActionLogForInstanceMock: listActionLogForInstanceMockInner,
    appendObservationNoteMock: appendObservationNoteMockInner,
    buildAppDepsMock: vi.fn(() => ({
      systemSettings: { getSetting: getSettingMockInner },
      treatmentProgramInstance: { getInstanceForPatient: getInstanceForPatientMockInner },
      programItemDiscussion: {
        listMessagesForStageItem: listMessagesForStageItemMockInner,
        mergeLegacyAdminReplies: mergeLegacyAdminRepliesMockInner,
        getUnreadCount: getUnreadCountMockInner,
      },
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
    mergeLegacyAdminRepliesMock.mockReset();
    getUnreadCountMock.mockReset();
    listActionLogForInstanceMock.mockReset();
    appendObservationNoteMock.mockReset();

    gateMock.mockResolvedValue(okGate());
    getSettingMock.mockResolvedValue({ valueJson: { value: true } });
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
    listMessagesForStageItemMock.mockResolvedValue([
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
    ]);
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
    appendObservationNoteMock.mockResolvedValue(undefined);
    listMessagesForStageItemMock.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000099",
        instanceStageItemId: itemId,
        patientUserId,
        senderRole: "patient",
        origin: "patient_observation",
        body: "Новый комментарий",
        mediaFileId: null,
        supportMessageId: null,
        createdAt: "2026-05-30T10:09:00.000Z",
      },
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

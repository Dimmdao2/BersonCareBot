import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  gateMock,
  buildAppDepsMock,
  getSettingMock,
  getInstanceForPatientMock,
  listMessagesForStageItemMock,
  mergeLegacyAdminRepliesMock,
  getUnreadCountMock,
} = vi.hoisted(() => {
  const getSettingMockInner = vi.fn();
  const getInstanceForPatientMockInner = vi.fn();
  const listMessagesForStageItemMockInner = vi.fn();
  const mergeLegacyAdminRepliesMockInner = vi.fn();
  const getUnreadCountMockInner = vi.fn();
  return {
    gateMock: vi.fn(),
    getSettingMock: getSettingMockInner,
    getInstanceForPatientMock: getInstanceForPatientMockInner,
    listMessagesForStageItemMock: listMessagesForStageItemMockInner,
    mergeLegacyAdminRepliesMock: mergeLegacyAdminRepliesMockInner,
    getUnreadCountMock: getUnreadCountMockInner,
    buildAppDepsMock: vi.fn(() => ({
      systemSettings: { getSetting: getSettingMockInner },
      treatmentProgramInstance: { getInstanceForPatient: getInstanceForPatientMockInner },
      programItemDiscussion: {
        listMessagesForStageItem: listMessagesForStageItemMockInner,
        mergeLegacyAdminReplies: mergeLegacyAdminRepliesMockInner,
        getUnreadCount: getUnreadCountMockInner,
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

import { GET } from "./route";

const instanceId = "11111111-1111-4111-8111-111111111111";
const itemA = "22222222-2222-4222-8222-222222222222";
const itemB = "33333333-3333-4333-8333-333333333333";

describe("GET discussion summary", () => {
  beforeEach(() => {
    gateMock.mockReset();
    getSettingMock.mockReset();
    getInstanceForPatientMock.mockReset();
    listMessagesForStageItemMock.mockReset();
    mergeLegacyAdminRepliesMock.mockReset();
    getUnreadCountMock.mockReset();

    gateMock.mockResolvedValue({
      ok: true as const,
      session: {
        user: {
          userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          role: "client" as const,
          phone: "+79990001122",
          bindings: {},
        },
      },
    });
    getSettingMock.mockResolvedValue({ valueJson: { value: true } });
    getInstanceForPatientMock.mockResolvedValue({
      id: instanceId,
      assignmentSource: "doctor",
      stages: [
        {
          id: "s1",
          items: [
            { id: itemA, snapshot: { title: "A" } },
            { id: itemB, snapshot: { title: "B" } },
          ],
        },
      ],
    });
    listMessagesForStageItemMock.mockImplementation(async (id: string) =>
      id === itemA
        ? [
            {
              id: "m1",
              instanceStageItemId: itemA,
              patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              senderRole: "patient",
              origin: "patient_observation",
              body: "one",
              mediaFileId: null,
              supportMessageId: null,
              createdAt: "2026-05-30T10:00:00.000Z",
            },
          ]
        : [],
    );
    mergeLegacyAdminRepliesMock.mockResolvedValue([]);
    getUnreadCountMock.mockResolvedValue(0);
  });

  it("returns batch summary map for requested items", async () => {
    const res = await GET(
      new Request(
        `http://localhost/api/patient/treatment-program-instances/${instanceId}/discussion/summary?itemIds=${itemA},${itemB}`,
      ),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      summaryByItemId: Record<string, { totalCount: number }>;
    };
    expect(data.ok).toBe(true);
    expect(data.summaryByItemId[itemA]?.totalCount).toBe(1);
    expect(data.summaryByItemId[itemB]?.totalCount).toBe(0);
  });
});

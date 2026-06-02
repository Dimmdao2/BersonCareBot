import { beforeEach, describe, expect, it, vi } from "vitest";
const {
  gateMock,
  buildAppDepsMock,
  getPatientProgramInteractionPolicyMock,
  getSettingMock,
  getInstanceForPatientMock,
  listMessagesForStageItemMock,
  listMessagesPageMock,
  mergeLegacyAdminRepliesMock,
  countMessagesForItemMock,
  countLegacyAdminRepliesMock,
  listLinkedSupportMessageIdsMock,
  getUnreadCountMock,
} = vi.hoisted(() => {
  const getSettingMockInner = vi.fn();
  const getInstanceForPatientMockInner = vi.fn();
  const listMessagesForStageItemMockInner = vi.fn();
  const listMessagesPageMockInner = vi.fn();
  const mergeLegacyAdminRepliesMockInner = vi.fn();
  const countMessagesForItemMockInner = vi.fn();
  const countLegacyAdminRepliesMockInner = vi.fn();
  const listLinkedSupportMessageIdsMockInner = vi.fn();
  const getUnreadCountMockInner = vi.fn();
  const getPatientProgramInteractionPolicyMockInner = vi.fn();
  return {
    gateMock: vi.fn(),
    getPatientProgramInteractionPolicyMock: getPatientProgramInteractionPolicyMockInner,
    getSettingMock: getSettingMockInner,
    getInstanceForPatientMock: getInstanceForPatientMockInner,
    listMessagesForStageItemMock: listMessagesForStageItemMockInner,
    listMessagesPageMock: listMessagesPageMockInner,
    mergeLegacyAdminRepliesMock: mergeLegacyAdminRepliesMockInner,
    countMessagesForItemMock: countMessagesForItemMockInner,
    countLegacyAdminRepliesMock: countLegacyAdminRepliesMockInner,
    listLinkedSupportMessageIdsMock: listLinkedSupportMessageIdsMockInner,
    getUnreadCountMock: getUnreadCountMockInner,
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
    listMessagesPageMock.mockReset();
    mergeLegacyAdminRepliesMock.mockReset();
    countMessagesForItemMock.mockReset();
    countLegacyAdminRepliesMock.mockReset();
    listLinkedSupportMessageIdsMock.mockReset();
    getUnreadCountMock.mockReset();
    getPatientProgramInteractionPolicyMock.mockReset();

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
    listMessagesPageMock.mockImplementation(async (input: { stageItemId: string; limit: number }) => {
      const all = await listMessagesForStageItemMock(input.stageItemId);
      return all.slice(-input.limit);
    });
    countMessagesForItemMock.mockImplementation(async (id: string) => {
      const all = await listMessagesForStageItemMock(id);
      return all.length;
    });
    countLegacyAdminRepliesMock.mockResolvedValue(0);
    listLinkedSupportMessageIdsMock.mockResolvedValue([]);
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

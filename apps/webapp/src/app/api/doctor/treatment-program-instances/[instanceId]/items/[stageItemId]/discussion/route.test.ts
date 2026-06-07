/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMock = vi.fn();
const getInstanceMock = vi.fn();
const getClientIdentityMock = vi.fn();
const listDiscussionPageMergedMock = vi.fn();

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => sessionMock(),
}));

vi.mock("@/modules/roles/service", () => ({
  canAccessDoctor: (role: string) => role === "doctor",
}));

vi.mock("@/modules/program-item-discussion/listDiscussionPage", () => ({
  listDiscussionPageMerged: (...args: unknown[]) => listDiscussionPageMergedMock(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: { getInstanceById: getInstanceMock },
    doctorClientsPort: { getClientIdentity: getClientIdentityMock },
    programItemDiscussion: {
      getLastReadAtForViewer: async () => null,
    },
  }),
}));

import { GET } from "./route";

const instanceId = "11111111-1111-4111-8111-111111111111";
const stageItemId = "22222222-2222-4222-8222-222222222222";

describe("GET doctor program item discussion", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    getInstanceMock.mockReset();
    getClientIdentityMock.mockReset();
    listDiscussionPageMergedMock.mockReset();
    sessionMock.mockResolvedValue({ user: { userId: "33333333-3333-4333-8333-333333333333", role: "doctor" } });
    getClientIdentityMock.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000001" });
    getInstanceMock.mockResolvedValue({
      assignmentSource: "doctor",
      patientUserId: "00000000-0000-4000-8000-000000000001",
      stages: [{ items: [{ id: stageItemId, snapshot: { title: "Присед" } }] }],
    });
    listDiscussionPageMergedMock.mockResolvedValue({
      page: [{ id: "msg-1", body: "Тест", createdAt: "2026-06-01T10:00:00.000Z" }],
      nextCursor: null,
      hasMore: false,
      totalCount: 1,
    });
  });

  it("returns messages for doctor-assigned program item", async () => {
    const res = await GET(new Request(`http://localhost/discussion?limit=30`), {
      params: Promise.resolve({ instanceId, stageItemId }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.messages).toHaveLength(1);
    expect(data.totalCount).toBe(1);
    expect(listDiscussionPageMergedMock).toHaveBeenCalledWith(
      expect.objectContaining({ stageItemId }),
    );
  });

  it("rejects promo assignment source", async () => {
    getInstanceMock.mockResolvedValue({
      assignmentSource: "promo",
      patientUserId: "00000000-0000-4000-8000-000000000001",
      stages: [{ items: [{ id: stageItemId, snapshot: {} }] }],
    });

    const res = await GET(new Request(`http://localhost/discussion`), {
      params: Promise.resolve({ instanceId, stageItemId }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("program_not_doctor_assigned");
  });

  it("returns 401 without session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/discussion`), {
      params: Promise.resolve({ instanceId, stageItemId }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when doctor has no access to patient", async () => {
    getClientIdentityMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/discussion`), {
      params: Promise.resolve({ instanceId, stageItemId }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
    expect(listDiscussionPageMergedMock).not.toHaveBeenCalled();
  });
});

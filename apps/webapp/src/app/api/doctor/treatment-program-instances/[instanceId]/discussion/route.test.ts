/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMock = vi.fn();
const getInstanceMock = vi.fn();
const getClientIdentityMock = vi.fn();
const listInstanceDiscussionPageMergedMock = vi.fn();

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => sessionMock(),
}));

vi.mock("@/modules/roles/service", () => ({
  canAccessDoctor: (role: string) => role === "doctor",
}));

vi.mock("@/modules/program-item-discussion/listInstanceDiscussionPage", () => ({
  listInstanceDiscussionPageMerged: (...args: unknown[]) => listInstanceDiscussionPageMergedMock(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: { getInstanceById: getInstanceMock },
    doctorClientsPort: { getClientIdentity: getClientIdentityMock },
    programItemDiscussion: {},
  }),
}));

import { GET } from "./route";

const instanceId = "11111111-1111-4111-8111-111111111111";
const stageItemA = "22222222-2222-4222-8222-222222222222";
const stageItemB = "33333333-3333-4333-8333-333333333333";

describe("GET doctor instance discussion", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    getInstanceMock.mockReset();
    getClientIdentityMock.mockReset();
    listInstanceDiscussionPageMergedMock.mockReset();
    sessionMock.mockResolvedValue({ user: { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "doctor" } });
    getClientIdentityMock.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000001" });
    getInstanceMock.mockResolvedValue({
      assignmentSource: "doctor",
      patientUserId: "00000000-0000-4000-8000-000000000001",
      stages: [
        {
          items: [
            { id: stageItemA, snapshot: { title: "Присед" } },
            { id: stageItemB, snapshot: { title: "Мост" } },
          ],
        },
      ],
    });
    listInstanceDiscussionPageMergedMock.mockResolvedValue({
      page: [{ id: "msg-1", body: "Тест", createdAt: "2026-06-01T10:00:00.000Z" }],
      nextCursor: null,
      hasMore: false,
      totalCount: 1,
    });
  });

  it("returns merged messages for all items by default", async () => {
    const res = await GET(new Request(`http://localhost/discussion?limit=30`), {
      params: Promise.resolve({ instanceId }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.messages).toHaveLength(1);
    expect(listInstanceDiscussionPageMergedMock).toHaveBeenCalledWith(
      expect.objectContaining({ stageItemIdFilter: null }),
    );
  });

  it("filters messages by stageItemId", async () => {
    const res = await GET(new Request(`http://localhost/discussion?stageItemId=${stageItemB}`), {
      params: Promise.resolve({ instanceId }),
    });

    expect(res.status).toBe(200);
    expect(listInstanceDiscussionPageMergedMock).toHaveBeenCalledWith(
      expect.objectContaining({ stageItemIdFilter: stageItemB }),
    );
  });

  it("returns 404 for unknown stage item", async () => {
    const res = await GET(
      new Request(`http://localhost/discussion?stageItemId=44444444-4444-4444-8444-444444444444`),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(404);
    expect(listInstanceDiscussionPageMergedMock).not.toHaveBeenCalled();
  });

  it("returns 401 when session is missing", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/discussion`), {
      params: Promise.resolve({ instanceId }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
    expect(listInstanceDiscussionPageMergedMock).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not doctor", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "u1", role: "patient" } });
    const res = await GET(new Request(`http://localhost/discussion`), {
      params: Promise.resolve({ instanceId }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
    expect(listInstanceDiscussionPageMergedMock).not.toHaveBeenCalled();
  });

  it("returns 400 when program is not doctor-assigned", async () => {
    getInstanceMock.mockResolvedValue({
      assignmentSource: "promo",
      patientUserId: "00000000-0000-4000-8000-000000000001",
      stages: [{ items: [] }],
    });
    const res = await GET(new Request(`http://localhost/discussion`), {
      params: Promise.resolve({ instanceId }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("program_not_doctor_assigned");
    expect(listInstanceDiscussionPageMergedMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid limit", async () => {
    const res = await GET(new Request(`http://localhost/discussion?limit=abc`), {
      params: Promise.resolve({ instanceId }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_limit");
    expect(listInstanceDiscussionPageMergedMock).not.toHaveBeenCalled();
  });
});

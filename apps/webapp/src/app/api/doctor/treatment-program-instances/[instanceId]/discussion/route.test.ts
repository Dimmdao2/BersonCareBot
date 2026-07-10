/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.fn();
const withDoctorWorkspacePrincipalMock = vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
});
const getInstanceMock = vi.fn();
const getClientIdentityForOrganizationMock = vi.fn();
const listInstanceDiscussionPageMergedMock = vi.fn();

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
    if (!fn) throw new Error("principal_callback_required");
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));

vi.mock("@/modules/program-item-discussion/listInstanceDiscussionPage", () => ({
  listInstanceDiscussionPageMerged: (...args: unknown[]) => listInstanceDiscussionPageMergedMock(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: { getInstanceById: getInstanceMock },
    doctorClientsPort: { getClientIdentityForOrganization: getClientIdentityForOrganizationMock },
    programItemDiscussion: {
      getLastReadAtForViewer: async () => null,
    },
  }),
}));

import { GET } from "./route";

const instanceId = "11111111-1111-4111-8111-111111111111";
const stageItemA = "22222222-2222-4222-8222-222222222222";
const stageItemB = "33333333-3333-4333-8333-333333333333";
const organizationId = "55555555-5555-4555-8555-555555555555";
const workspaceCtx = {
  session: { user: { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "doctor", bindings: {} } },
  organizationId,
  membershipId: "66666666-6666-4666-8666-666666666666",
  membershipRole: "doctor",
  specialistId: null,
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

describe("GET doctor instance discussion", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    getInstanceMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    listInstanceDiscussionPageMergedMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000001" });
    getInstanceMock.mockResolvedValue({
      organizationId,
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
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
    });
    const res = await GET(new Request(`http://localhost/discussion`), {
      params: Promise.resolve({ instanceId }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
    expect(listInstanceDiscussionPageMergedMock).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not doctor", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });
    const res = await GET(new Request(`http://localhost/discussion`), {
      params: Promise.resolve({ instanceId }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
    expect(listInstanceDiscussionPageMergedMock).not.toHaveBeenCalled();
  });

  it("returns 400 when program is not doctor-assigned", async () => {
    getInstanceMock.mockResolvedValue({
      organizationId,
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

  it("returns 404 when instance belongs to another organization", async () => {
    getInstanceMock.mockResolvedValue({
      organizationId: "77777777-7777-4777-8777-777777777777",
      assignmentSource: "doctor",
      patientUserId: "00000000-0000-4000-8000-000000000001",
      stages: [{ items: [{ id: stageItemA, snapshot: { title: "Присед" } }] }],
    });
    const res = await GET(new Request(`http://localhost/discussion`), {
      params: Promise.resolve({ instanceId }),
    });
    expect(res.status).toBe(404);
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

  it("returns 500 when discussion listing throws unexpectedly", async () => {
    listInstanceDiscussionPageMergedMock.mockRejectedValue(new Error("database unavailable"));
    const res = await GET(new Request(`http://localhost/discussion?limit=30`), {
      params: Promise.resolve({ instanceId }),
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("internal_error");
  });

  it("returns 404 when listing error message indicates not found", async () => {
    listInstanceDiscussionPageMergedMock.mockRejectedValue(new Error("Программа не найдена"));
    const res = await GET(new Request(`http://localhost/discussion?limit=30`), {
      params: Promise.resolve({ instanceId }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });
});

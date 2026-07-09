/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.fn();
const withDoctorWorkspacePrincipalMock = vi.fn((_: unknown, fn: () => unknown) => fn());
const getInstanceMock = vi.fn();
const getClientIdentityForOrganizationMock = vi.fn();
const getDiscussionSummaryForItemMock = vi.fn();

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) => withDoctorWorkspacePrincipalMock(ctx, fn),
}));

vi.mock("@/modules/program-item-discussion/listDiscussionPage", () => ({
  getDiscussionSummaryForItem: (...args: unknown[]) => getDiscussionSummaryForItemMock(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: { getInstanceById: getInstanceMock },
    doctorClientsPort: { getClientIdentityForOrganization: getClientIdentityForOrganizationMock },
    programItemDiscussion: {},
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

describe("GET doctor instance discussion summary", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation((_: unknown, fn: () => unknown) => fn());
    getInstanceMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    getDiscussionSummaryForItemMock.mockReset();
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
    getDiscussionSummaryForItemMock.mockResolvedValue({ totalCount: 2, lastMessage: null });
  });

  it("returns summary for all stage items", async () => {
    const res = await GET(new Request(`http://localhost/discussion/summary`), {
      params: Promise.resolve({ instanceId }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(Object.keys(data.summaryByStageItemId)).toEqual([stageItemA, stageItemB]);
    expect(getDiscussionSummaryForItemMock).toHaveBeenCalledTimes(2);
  });

  it("returns summary for requested stageItemIds only", async () => {
    const res = await GET(
      new Request(`http://localhost/discussion/summary?stageItemIds=${stageItemA}`),
      { params: Promise.resolve({ instanceId }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Object.keys(data.summaryByStageItemId)).toEqual([stageItemA]);
    expect(getDiscussionSummaryForItemMock).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when session is missing", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
    });
    const res = await GET(new Request(`http://localhost/discussion/summary`), {
      params: Promise.resolve({ instanceId }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
    expect(getDiscussionSummaryForItemMock).not.toHaveBeenCalled();
  });

  it("returns 400 when program is not doctor-assigned", async () => {
    getInstanceMock.mockResolvedValue({
      organizationId,
      assignmentSource: "course",
      patientUserId: "00000000-0000-4000-8000-000000000001",
      stages: [{ items: [{ id: stageItemA, snapshot: { title: "Присед" } }] }],
    });
    const res = await GET(new Request(`http://localhost/discussion/summary`), {
      params: Promise.resolve({ instanceId }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("program_not_doctor_assigned");
    expect(getDiscussionSummaryForItemMock).not.toHaveBeenCalled();
  });

  it("returns 404 when instance belongs to another organization", async () => {
    getInstanceMock.mockResolvedValue({
      organizationId: "77777777-7777-4777-8777-777777777777",
      assignmentSource: "doctor",
      patientUserId: "00000000-0000-4000-8000-000000000001",
      stages: [{ items: [{ id: stageItemA, snapshot: { title: "Присед" } }] }],
    });
    const res = await GET(new Request(`http://localhost/discussion/summary`), {
      params: Promise.resolve({ instanceId }),
    });
    expect(res.status).toBe(404);
    expect(getDiscussionSummaryForItemMock).not.toHaveBeenCalled();
  });
});

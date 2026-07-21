import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const entitlementMock = vi.hoisted(() => vi.fn());
const createCourseMock = vi.hoisted(() => vi.fn());
const listCoursesMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: authMock,
}));
vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlement: entitlementMock,
  requireEntitlementForMutation: entitlementMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({ courses: { createCourse: createCourseMock, listCoursesForDoctor: listCoursesMock } }),
}));
vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, _source: string, fn: () => unknown) => fn(),
}));

import { GET, POST } from "./route";

const workspace = {
  organizationId: "org-a",
  session: { user: { userId: "doctor-a" } },
};
const validBody = {
  title: "Course",
  programTemplateId: "550e8400-e29b-41d4-a716-446655440000",
};

describe("courses entitlement ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ ok: true, ctx: workspace });
    entitlementMock.mockResolvedValue({ ok: true });
    createCourseMock.mockResolvedValue({ id: "course-a" });
    listCoursesMock.mockResolvedValue([]);
  });

  it("does not resolve entitlement or call service when authentication fails", async () => {
    authMock.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(validBody) }));
    expect(response.status).toBe(401);
    expect(entitlementMock).not.toHaveBeenCalled();
    expect(createCourseMock).not.toHaveBeenCalled();
  });

  it("uses only the authenticated organization and stops before service on a disabled mechanic", async () => {
    entitlementMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "entitlement_required", mechanic: "courses" }, { status: 403 }),
    });
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ...validBody, organizationId: "forged-org-b" }) }));
    expect(response.status).toBe(403);
    expect(entitlementMock).toHaveBeenCalledWith(workspace, "courses");
    expect(createCourseMock).not.toHaveBeenCalled();
  });

  it("calls the service after auth and a successful entitlement check", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(validBody) }));
    expect(response.status).toBe(200);
    expect(createCourseMock).toHaveBeenCalledOnce();
  });

  it("returns a stable hard-block response when the atomic course quota rejects the insert", async () => {
    createCourseMock.mockRejectedValueOnce(new Error("saas_quota_reached:courses:3/3"));
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(validBody) }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "quota_reached", mechanic: "courses" });
  });

  it("denies list access before the service when courses are disabled", async () => {
    entitlementMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "entitlement_required" }, { status: 403 }),
    });
    const response = await GET(new Request("http://localhost/api/doctor/courses?organizationId=forged-org-b"));
    expect(response.status).toBe(403);
    expect(entitlementMock).toHaveBeenCalledWith(workspace, "courses");
    expect(listCoursesMock).not.toHaveBeenCalled();
  });
});

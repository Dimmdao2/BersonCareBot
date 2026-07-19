import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requirePatientApiBusinessAccessMock = vi.hoisted(() => vi.fn());
const requireEntitlementMock = vi.hoisted(() => vi.fn());
const listAssignedForPatientMock = vi.hoisted(() => vi.fn());
const resolveActiveOrganizationForPatientMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: requirePatientApiBusinessAccessMock,
}));
vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlement: requireEntitlementMock,
}));
vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withPatientOrganizationPrincipal: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    courses: { listAssignedForPatient: listAssignedForPatientMock },
    patientOrganization: { resolveActiveOrganizationForPatient: resolveActiveOrganizationForPatientMock },
  }),
}));

import { GET } from "./route";

const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("GET /api/patient/courses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePatientApiBusinessAccessMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: USER_ID } },
    });
    resolveActiveOrganizationForPatientMock.mockResolvedValue({ ok: true, organizationId: "org-a" });
    requireEntitlementMock.mockResolvedValue({ ok: true });
    listAssignedForPatientMock.mockResolvedValue([{ id: "course-a" }]);
  });

  it("uses the active enrollment organization, not a request-selected organization", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(requireEntitlementMock).toHaveBeenCalledWith({ organizationId: "org-a" }, "courses");
    expect(listAssignedForPatientMock).toHaveBeenCalledWith(USER_ID);
  });

  it("denies entitlement-off before the assigned-course read", async () => {
    requireEntitlementMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "entitlement_required" }, { status: 403 }),
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(listAssignedForPatientMock).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const listPatientPackageSessionsMock = vi.hoisted(() => vi.fn());
const getSettingMock = vi.hoisted(() => vi.fn());

vi.mock("../../../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    memberships: { listPatientPackageSessions: listPatientPackageSessionsMock },
    systemSettings: { getSetting: getSettingMock },
  }),
}));

import { GET } from "./route";

const PKG_ID = "550e8400-e29b-41d4-a716-446655440010";

describe("GET patient-packages/[id]/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1", session: { user: { userId: "u1" } } },
    });
    getSettingMock.mockResolvedValue({ valueJson: false });
    listPatientPackageSessionsMock.mockResolvedValue([]);
  });

  it("passes includePast=false by default", async () => {
    const res = await GET(new Request(`http://localhost/sessions?includePast=false`), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    expect(res.status).toBe(200);
    expect(listPatientPackageSessionsMock).toHaveBeenCalledWith(PKG_ID, "org-1", {
      includePast: false,
      allowPastUnlink: false,
    });
  });

  it("passes includePast=true when query set", async () => {
    getSettingMock.mockResolvedValue({ valueJson: true });
    await GET(new Request(`http://localhost/sessions?includePast=true`), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    expect(listPatientPackageSessionsMock).toHaveBeenCalledWith(PKG_ID, "org-1", {
      includePast: true,
      allowPastUnlink: true,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const getAppDisplayTimeZoneMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: () => getAppDisplayTimeZoneMock(),
}));

import { GET } from "./route";

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const CANONICAL_PATIENT_ID = "00000000-0000-4000-8000-000000000002";

describe("doctor patient proactive insights route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORG_ID, session: { user: { userId: "doctor-1", role: "doctor" } } },
    });
    getAppDisplayTimeZoneMock.mockResolvedValue("Europe/Moscow");
  });

  it("rejects reads outside selected workspace", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    const listForPatient = vi.fn();
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      doctorProactiveInsights: { listForPatient },
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(res.status).toBe(404);
    expect(getAppDisplayTimeZoneMock).not.toHaveBeenCalled();
    expect(listForPatient).not.toHaveBeenCalled();
  });

  it("loads insights for canonical patient", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const listForPatient = vi.fn().mockResolvedValue([{ id: "signal-1" }]);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      doctorProactiveInsights: { listForPatient },
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(res.status).toBe(200);
    expect(listForPatient).toHaveBeenCalledWith({
      patientUserId: CANONICAL_PATIENT_ID,
      organizationId: ORG_ID,
      displayIana: "Europe/Moscow",
    });
  });
});

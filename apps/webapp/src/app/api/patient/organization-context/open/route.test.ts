import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const patientClientBusinessGateMock = vi.hoisted(() => vi.fn());
const resolveTargetMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getCurrentSessionMock }));
vi.mock("@/app-layer/platform-access", () => ({ patientClientBusinessGate: patientClientBusinessGateMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientOrganization: { resolveTreatmentProgramOrganizationForPatient: resolveTargetMock },
  }),
}));
vi.mock("@/modules/roles/service", () => ({ canAccessPatient: () => true }));

import { GET } from "./route";

const PATIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const INSTANCE_ID = "33333333-3333-4333-8333-333333333333";

describe("patient organization trusted object opener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentSessionMock.mockResolvedValue({ user: { userId: PATIENT_ID, role: "client" } });
    patientClientBusinessGateMock.mockResolvedValue("allow");
  });

  it("switches only to the organization derived from the owned object", async () => {
    resolveTargetMock.mockResolvedValue({ ok: true, organizationId: ORG_B });
    const response = await GET(new Request(
      `http://localhost/api/patient/organization-context/open?kind=treatment_program&instanceId=${INSTANCE_ID}`,
    ));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`http://localhost/app/patient/treatment/${INSTANCE_ID}`);
    expect(response.cookies.get("bc_patient_organization")?.value).toBe(ORG_B);
    expect(resolveTargetMock).toHaveBeenCalledWith(PATIENT_ID, INSTANCE_ID);
  });

  it("does not reveal or persist a foreign object organization", async () => {
    resolveTargetMock.mockResolvedValue({ ok: false, reason: "organization_target_not_authorized" });
    const response = await GET(new Request(
      `http://localhost/api/patient/organization-context/open?kind=treatment_program&instanceId=${INSTANCE_ID}`,
    ));
    expect(response.headers.get("location")).toBe("http://localhost/app/patient");
    expect(response.cookies.get("bc_patient_organization")).toBeUndefined();
  });
});

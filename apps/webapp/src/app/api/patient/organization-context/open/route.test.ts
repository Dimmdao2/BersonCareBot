import { beforeEach, describe, expect, it, vi } from "vitest";

const patientBusinessGateMock = vi.hoisted(() => vi.fn());
const resolveTargetMock = vi.hoisted(() => vi.fn());
const resolveOrganizationMock = vi.hoisted(() => vi.fn());
const getRememberedOrganizationMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: patientBusinessGateMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientOrganization: {
      resolveTreatmentProgramOrganizationForPatient: resolveTargetMock,
      resolveActiveOrganizationForPatient: resolveOrganizationMock,
    },
  }),
}));
vi.mock("@/app-layer/patient-organization/requestContext", () => ({
  getRememberedPatientOrganizationId: getRememberedOrganizationMock,
}));
import { GET } from "./route";

const PATIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const INSTANCE_ID = "33333333-3333-4333-8333-333333333333";

describe("patient organization trusted object opener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patientBusinessGateMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: PATIENT_ID, role: "client" } },
    });
    getRememberedOrganizationMock.mockResolvedValue(null);
  });

  it("switches only to the organization derived from the owned object", async () => {
    resolveTargetMock.mockResolvedValue({ ok: true, organizationId: ORG_B });
    const response = await GET(
      new Request(
        `http://localhost/api/patient/organization-context/open?kind=treatment_program&instanceId=${INSTANCE_ID}`,
      ),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("location")).toBe(`/app/patient/treatment/${INSTANCE_ID}`);
    expect(response.cookies.get("bc_patient_organization")?.value).toBe(ORG_B);
    expect(resolveTargetMock).toHaveBeenCalledWith(PATIENT_ID, INSTANCE_ID);
  });

  it("does not reveal or persist a foreign object organization", async () => {
    resolveTargetMock.mockResolvedValue({
      ok: false,
      reason: "organization_target_not_authorized",
    });
    const response = await GET(
      new Request(
        `http://localhost/api/patient/organization-context/open?kind=treatment_program&instanceId=${INSTANCE_ID}`,
      ),
    );
    expect(response.headers.get("location")).toBe(
      "/app/patient/organizations?reason=organization_unavailable",
    );
    expect(response.cookies.get("bc_patient_organization")).toBeUndefined();
  });

  it("validates and persists an exact reminder organization before continuing", async () => {
    getRememberedOrganizationMock.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    resolveOrganizationMock.mockResolvedValue({ ok: true, organizationId: ORG_B });
    const response = await GET(
      new Request(
        `http://localhost/api/patient/organization-context/open?kind=organization_go&organizationId=${ORG_B}&goKind=daily-warmup`,
      ),
    );
    expect(response.headers.get("location")).toBe(
      `/app/patient/go/daily-warmup?from=reminder&organizationId=${ORG_B}`,
    );
    expect(response.cookies.get("bc_patient_organization")?.value).toBe(ORG_B);
    expect(response.cookies.get("bc_patient_organization_change_receipt")?.value).toBe(ORG_B);
    expect(resolveOrganizationMock).toHaveBeenCalledWith(PATIENT_ID, {
      verifiedTargetOrganizationId: ORG_B,
    });
  });

  it("does not issue a context-change receipt when the verified target is already current", async () => {
    getRememberedOrganizationMock.mockResolvedValue(ORG_B);
    resolveOrganizationMock.mockResolvedValue({ ok: true, organizationId: ORG_B });
    const response = await GET(new Request(
      `http://localhost/api/patient/organization-context/open?kind=organization_go&organizationId=${ORG_B}&goKind=daily-warmup`,
    ));
    expect(response.cookies.get("bc_patient_organization_change_receipt")).toMatchObject({
      value: "",
      expires: new Date(0),
    });
  });

  it("does not overwrite the preference for a revoked reminder organization", async () => {
    resolveOrganizationMock.mockResolvedValue({
      ok: false,
      reason: "organization_target_not_authorized",
    });
    const response = await GET(
      new Request(
        `http://localhost/api/patient/organization-context/open?kind=organization_go&organizationId=${ORG_B}&goKind=plan-start-lesson`,
      ),
    );
    expect(response.headers.get("location")).toBe(
      "/app/patient/organizations?reason=organization_unavailable",
    );
    expect(response.cookies.get("bc_patient_organization")).toBeUndefined();
  });

  it("keeps neutral recovery relative to the browser origin and ignores an external next", async () => {
    resolveOrganizationMock.mockResolvedValue({
      ok: false,
      reason: "organization_target_not_authorized",
    });
    const response = await GET(
      new Request(
        `https://attacker.example/api/patient/organization-context/open?kind=organization_go&organizationId=${ORG_B}&goKind=daily-warmup&next=${encodeURIComponent("https://evil.example/steal")}`,
      ),
    );
    expect(response.headers.get("location")).toBe(
      "/app/patient/organizations?reason=organization_unavailable",
    );
    expect(response.headers.get("location")).not.toContain("attacker.example");
    expect(response.headers.get("location")).not.toContain("evil.example");
  });

  it("keeps the unauthenticated entry relative without changing login continuation policy", async () => {
    patientBusinessGateMock.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const response = await GET(
      new Request(
        `https://attacker.example/api/patient/organization-context/open?kind=organization_go&organizationId=${ORG_B}&goKind=daily-warmup`,
      ),
    );
    expect(response.headers.get("location")).toBe("/app");
    expect(resolveOrganizationMock).not.toHaveBeenCalled();
  });
});

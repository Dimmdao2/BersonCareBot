import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: async <T,>(
    _workspace: { organizationId: string },
    _source: string,
    fn: () => Promise<T>,
  ) => fn(),
}));

vi.mock("@/app-layer/di/buildAppDeps", async () => {
  const { createClinicalTestsService } = await import("@/modules/tests/service");
  const { inMemoryClinicalTestsPort } = await import("@/app-layer/testing/clinicalLibraryInMemory");
  const { inMemoryReferencesPort } = await import("@/infra/repos/inMemoryReferences");
  const clinicalTests = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
  return {
    buildAppDeps: () => ({ clinicalTests }),
  };
});

import { getCurrentSession } from "@/modules/auth/service";
import { resetInMemoryClinicalTestsStore } from "@/app-layer/testing/clinicalLibraryInMemory";
import { POST } from "./route";

describe("POST /api/doctor/clinical-tests", () => {
  beforeEach(() => {
    resetInMemoryClinicalTestsStore();
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        session: { user: { userId: "d1", role: "doctor", bindings: {} } },
      },
    });
    vi.mocked(getCurrentSession).mockReset();
  });

  it("returns auth gate response", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "T" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("propagates workspace gate denial", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ ok: false, error: "doctor_workspace_membership_required" }, { status: 403 }),
    });
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "T" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("creates test with assessmentKind from catalog", async () => {
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Api T", assessmentKind: "mobility" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; item: { assessmentKind: string | null } };
    expect(data.ok).toBe(true);
    expect(data.item.assessmentKind).toBe("mobility");
  });

  it("returns 400 when assessmentKind not in catalog", async () => {
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Bad", assessmentKind: "not_in_catalog" }),
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { ok: boolean; error: string };
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/вид оценки/);
  });
});

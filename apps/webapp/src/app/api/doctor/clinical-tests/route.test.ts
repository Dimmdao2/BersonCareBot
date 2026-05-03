import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: vi.fn(),
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
    vi.mocked(getCurrentSession).mockReset();
  });

  it("returns 401 without session", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "T" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for client role", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    } as never);
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
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    } as never);
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
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    } as never);
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

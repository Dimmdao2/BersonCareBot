import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const {
  requireClinicManagementApiContextMock,
  setOrganizationSlugMock,
  getSlugManagementStateMock,
} = vi.hoisted(() => ({
  requireClinicManagementApiContextMock: vi.fn(),
  setOrganizationSlugMock: vi.fn(),
  getSlugManagementStateMock: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireClinicManagementApiContext: requireClinicManagementApiContextMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    clinicDirectory: {
      setOrganizationSlug: setOrganizationSlugMock,
      getSlugManagementState: getSlugManagementStateMock,
    },
  })),
}));

import { POST } from "./route";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function request(body: unknown) {
  return new Request("https://app.example/api/clinic/slug", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/clinic/slug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireClinicManagementApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORG },
    });
    getSlugManagementStateMock.mockResolvedValue({
      currentSlug: "clinic-new",
      selfServiceRenameAvailable: false,
    });
  });

  it.each([
    { slug: "first-clinic", irreversibleRenameConfirmed: false },
    { slug: "renamed-clinic", irreversibleRenameConfirmed: true },
  ])("denies a non-owner before either claim or rename can run", async (body) => {
    requireClinicManagementApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });

    const response = await POST(request(body));

    expect(response.status).toBe(403);
    expect(setOrganizationSlugMock).not.toHaveBeenCalled();
  });

  it("uses only the resolved organization and returns the refreshed state", async () => {
    setOrganizationSlugMock.mockResolvedValueOnce({ ok: true, slug: "clinic-new" });

    const response = await POST(request({
      slug: "clinic-new",
      irreversibleRenameConfirmed: true,
      organizationId: "attacker-org",
    }));

    expect(response.status).toBe(400);
    expect(setOrganizationSlugMock).not.toHaveBeenCalled();

    const accepted = await POST(request({
      slug: "clinic-new",
      irreversibleRenameConfirmed: true,
    }));
    expect(accepted.status).toBe(200);
    expect(setOrganizationSlugMock).toHaveBeenCalledWith({
      organizationId: ORG,
      slug: "clinic-new",
      irreversibleRenameConfirmed: true,
    });
    await expect(accepted.json()).resolves.toEqual({
      ok: true,
      slug: "clinic-new",
      state: { currentSlug: "clinic-new", selfServiceRenameAvailable: false },
    });
  });

  it("keeps a taken slug as an actionable conflict", async () => {
    setOrganizationSlugMock.mockResolvedValueOnce({ ok: false, code: "slug_unavailable" });

    const response = await POST(request({
      slug: "taken-clinic",
      irreversibleRenameConfirmed: false,
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "slug_unavailable",
    });
  });
});

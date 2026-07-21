import { beforeEach, describe, expect, it, vi } from "vitest";

const requireClinicManagementBookingEngineMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback()),
);
const listBranchesMock = vi.hoisted(() => vi.fn());
const createPhysicalBranchMock = vi.hoisted(() => vi.fn());
const requireEntitlementMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireClinicManagementBookingEngine: requireClinicManagementBookingEngineMock,
}));

vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlementForMutation: requireEntitlementMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { GET, POST } from "./route";

describe("/api/admin/booking-engine/branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
    );
    requireClinicManagementBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        service: { catalog: { listBranches: listBranchesMock, createPhysicalBranch: createPhysicalBranchMock } },
      },
    });
    requireEntitlementMock.mockReset();
    requireEntitlementMock.mockResolvedValue({ ok: true });
  });

  it("GET lists branches for the caller's organization", async () => {
    listBranchesMock.mockResolvedValue([]);
    const res = await GET();
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(listBranchesMock).toHaveBeenCalledWith("org-1");
  });

  it("POST passes shortTitle through to server-owned physical creation", async () => {
    createPhysicalBranchMock.mockResolvedValue({ id: "branch-1" });

    const res = await POST(
      new Request("http://localhost/api/admin/booking-engine/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Санкт-Петербург",
          shortTitle: "СПб",
          cityCode: "spb",
          address: null,
          timezone: "Europe/Moscow",
          sortOrder: 10,
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(createPhysicalBranchMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", title: "Санкт-Петербург", shortTitle: "СПб" }),
    );
  });

  it("POST defaults shortTitle to null when omitted", async () => {
    createPhysicalBranchMock.mockResolvedValue({ id: "branch-2" });

    await POST(
      new Request("http://localhost/api/admin/booking-engine/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Москва", cityCode: "msk" }),
      }),
    );
    expect(createPhysicalBranchMock).toHaveBeenCalledWith(expect.objectContaining({ shortTitle: null }));
  });

  it("ignores a client-nominated creation color", async () => {
    createPhysicalBranchMock.mockResolvedValue({ id: "branch-3", color: "#2563EB" });

    await POST(new Request("http://localhost/api/admin/booking-engine/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Казань", cityCode: "kazan", color: "#000000" }),
    }));

    expect(createPhysicalBranchMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ color: expect.anything() }),
    );
  });

  it("rejects attempts to create the reserved Online identity through generic branch CRUD", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/booking-engine/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Онлайн", cityCode: "online" }),
      }),
    );
    expect(res.status).toBe(409);
    expect(createPhysicalBranchMock).not.toHaveBeenCalled();
  });

  it("denies booking entitlement after composed auth without upserting a branch", async () => {
    const { NextResponse } = await import("next/server");
    requireEntitlementMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "entitlement_required", mechanic: "booking" }, { status: 403 }),
    });

    const res = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ title: "M", cityCode: "msk" }) }));

    expect(res.status).toBe(403);
    expect(createPhysicalBranchMock).not.toHaveBeenCalled();
    expect(requireClinicManagementBookingEngineMock.mock.invocationCallOrder[0]).toBeLessThan(
      requireEntitlementMock.mock.invocationCallOrder[0]!,
    );
  });
});

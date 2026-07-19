import { beforeEach, describe, expect, it, vi } from "vitest";

const requireClinicManagementBookingEngineMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback()),
);
const listBranchesMock = vi.hoisted(() => vi.fn());
const upsertBranchMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireClinicManagementBookingEngine: requireClinicManagementBookingEngineMock,
}));

vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlement: async () => ({ ok: true }),
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
        service: { catalog: { listBranches: listBranchesMock, upsertBranch: upsertBranchMock } },
      },
    });
  });

  it("GET lists branches for the caller's organization", async () => {
    listBranchesMock.mockResolvedValue([]);
    const res = await GET();
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(listBranchesMock).toHaveBeenCalledWith("org-1");
  });

  it("POST passes shortTitle through to upsertBranch on creation (owner-review §4: short name available at create time)", async () => {
    upsertBranchMock.mockResolvedValue({ id: "branch-1" });

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
    expect(upsertBranchMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", title: "Санкт-Петербург", shortTitle: "СПб" }),
    );
  });

  it("POST defaults shortTitle to null when omitted", async () => {
    upsertBranchMock.mockResolvedValue({ id: "branch-2" });

    await POST(
      new Request("http://localhost/api/admin/booking-engine/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Москва", cityCode: "msk" }),
      }),
    );
    expect(upsertBranchMock).toHaveBeenCalledWith(expect.objectContaining({ shortTitle: null }));
  });
});

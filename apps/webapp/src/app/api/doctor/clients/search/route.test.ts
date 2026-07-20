import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const listClientsMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(<T,>(_ctx: { organizationId: string }, fn: () => T) => fn()),
);

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorClients: { listClients: listClientsMock },
  }),
}));

import { GET } from "./route";

describe("GET /api/doctor/clients/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes calendar patient search to the selected organization", async () => {
    const ctx = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      session: { user: { userId: "doctor-1", role: "doctor" } },
    };
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx });
    listClientsMock.mockResolvedValue([
      {
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        displayName: "Иванов Иван",
        firstName: "Иван",
        lastName: "Иванов",
        patronymic: null,
        phone: "+79990000001",
      },
    ]);

    const res = await GET(new Request("http://localhost/api/doctor/clients/search?q=Иван&limit=20"));

    expect(res.status).toBe(200);
    expect(listClientsMock).toHaveBeenCalledWith({
      search: "Иван",
      organizationId: ctx.organizationId,
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(ctx, expect.any(Function));
    expect(await res.json()).toMatchObject({
      ok: true,
      clients: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
    });
  });
});

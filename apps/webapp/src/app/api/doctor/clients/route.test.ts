import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const createDoctorClientMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async <T,>(
    _ctx: { organizationId: string },
    _source: string,
    fn: () => Promise<T>,
  ) => fn()),
);

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/app-layer/doctor/createDoctorClient", () => ({
  createDoctorClient: createDoctorClientMock,
}));

import { POST } from "./route";

const gateContext = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  session: { user: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "doctor" } },
};
const patientOrganization = { createManualOrganizationClient: vi.fn() };
const emailSetupAccess = { requestContactEmailSetup: vi.fn() };

describe("POST /api/doctor/clients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildAppDepsMock.mockReturnValue({ patientOrganization, emailSetupAccess });
  });

  it("returns 403 for client role", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });

    const res = await POST(
      new Request("http://localhost/api/doctor/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+79990000001" }),
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "forbidden" });
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("creates the client under the exact doctor workspace principal", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: gateContext });
    createDoctorClientMock.mockResolvedValue({
      ok: true,
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      displayName: "Иванов Иван Иванович",
      lastName: "Иванов",
      firstName: "Иван",
      patronymic: "Иванович",
      phoneNormalized: "+79990000001",
      created: true,
      emailSetupEnqueued: false,
    });

    const res = await POST(
      new Request("http://localhost/api/doctor/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastName: "Иванов",
          firstName: "Иван",
          patronymic: "Иванович",
          phone: "+79990000001",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      gateContext,
      "doctor.clients.create",
      expect.any(Function),
    );
    expect(createDoctorClientMock).toHaveBeenCalledWith(
      {
        organizationId: gateContext.organizationId,
        createdByUserId: gateContext.session.user.userId,
        lastName: "Иванов",
        firstName: "Иван",
        patronymic: "Иванович",
        phone: "+79990000001",
        email: undefined,
      },
      { patientOrganization, emailSetupAccess },
    );
    expect(await res.json()).toMatchObject({
      ok: true,
      client: {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        displayName: "Иванов Иван Иванович",
        lastName: "Иванов",
        firstName: "Иван",
        patronymic: "Иванович",
        phone: "+79990000001",
      },
    });
  });

  it("does not fall back to a global identity writer when organization registration is unavailable", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: gateContext });
    buildAppDepsMock.mockReturnValue({ patientOrganization: null, emailSetupAccess });

    const res = await POST(
      new Request("http://localhost/api/doctor/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastName: "Иванов", firstName: "Иван", phone: "+79990000001" }),
      }),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "client_creation_unavailable" });
    expect(createDoctorClientMock).not.toHaveBeenCalled();
  });

  it("rejects the legacy displayName-only identity contract", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: gateContext });

    const res = await POST(
      new Request("http://localhost/api/doctor/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Иван Иванов", phone: "+79990000001" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(createDoctorClientMock).not.toHaveBeenCalled();
  });
});

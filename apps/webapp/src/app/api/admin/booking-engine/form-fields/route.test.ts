import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback()),
);
const listAdminFieldsMock = vi.hoisted(() => vi.fn());
const upsertAdminFieldMock = vi.hoisted(() => vi.fn());
const getDefaultOrganizationIdMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingEngine: {
      organization: {
        getDefaultOrganizationId: getDefaultOrganizationIdMock,
      },
    },
    bookingForm: {
      listAdminFields: listAdminFieldsMock,
      upsertAdminField: upsertAdminFieldMock,
    },
  }),
}));

import { GET, POST } from "./route";

describe("/api/admin/booking-engine/form-fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
    );
  });

  it("GET lists fields using workspace organization without principal wrapper", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1", session: { user: { userId: "user-1" } } },
    });
    listAdminFieldsMock.mockResolvedValue([{ id: "field-1" }]);

    const res = await GET();
    const json = (await res.json()) as { ok?: boolean; fields?: unknown[] };

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, fields: [{ id: "field-1" }] });
    expect(listAdminFieldsMock).toHaveBeenCalledWith("org-1");
    expect(getDefaultOrganizationIdMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it("POST upserts field under workspace principal", async () => {
    const gateCtx = { organizationId: "org-1", session: { user: { userId: "user-1" } } };
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: gateCtx,
    });
    upsertAdminFieldMock.mockResolvedValue({ id: "field-1" });

    const res = await POST(
      new Request("http://localhost/api/admin/booking-engine/form-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldKey: "complaints",
          fieldType: "textarea",
          label: "Жалобы",
          isRequired: true,
          visibleToPatient: true,
          visibleToStaff: true,
          sortOrder: 10,
          isActive: true,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      gateCtx,
      "admin.booking-engine.form-fields.upsert",
      expect.any(Function),
    );
    expect(upsertAdminFieldMock).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        fieldKey: "complaints",
        fieldType: "textarea",
        label: "Жалобы",
        placeholder: null,
        isRequired: true,
      }),
    );
    expect(getDefaultOrganizationIdMock).not.toHaveBeenCalled();
  });

  it("POST rejects invalid body before principal wrapper", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1", session: { user: { userId: "user-1" } } },
    });

    const res = await POST(
      new Request("http://localhost/api/admin/booking-engine/form-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldKey: "" }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };

    expect(res.status).toBe(400);
    expect(json).toEqual({ ok: false, error: "invalid_body" });
    expect(upsertAdminFieldMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });
});

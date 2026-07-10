import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const principalState = vi.hoisted(() => ({ inside: false }));
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async <T,>(
    _workspace: { organizationId: string },
    _source: string,
    fn: () => Promise<T>,
  ) => {
    principalState.inside = true;
    try {
      return await fn();
    } finally {
      principalState.inside = false;
    }
  }),
);
const softDeleteByIntegratorIdMock = vi.hoisted(() => vi.fn());
const emitBookingDeletedEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireAdminWorkspaceApiContext: requireAdminWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock("@/app-layer/booking/emitBookingDeletedEvent", () => ({
  emitBookingDeletedEvent: emitBookingDeletedEventMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(),
}));

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { POST } from "./route";

const RECORD_ID = "rt-record-1";

function gateCtx(organizationId = "org-1") {
  return {
    organizationId,
    membershipId: "m1",
    membershipRole: "owner",
    specialistId: null,
    canManageOrganization: true,
    canManageAllSpecialists: true,
    session: { user: { userId: "u1", role: "admin" }, adminMode: true },
  };
}

function req() {
  return new Request("http://localhost/soft-delete", { method: "POST" });
}

describe("POST admin appointment-records soft-delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
    vi.mocked(buildAppDeps).mockReturnValue({
      appointmentProjection: { softDeleteByIntegratorId: softDeleteByIntegratorIdMock },
    } as never);
    emitBookingDeletedEventMock.mockResolvedValue(undefined);
  });

  it("returns the gate response when the caller has no resolved admin workspace", async () => {
    requireAdminWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });

    const res = await POST(req(), { params: Promise.resolve({ integratorRecordId: RECORD_ID }) });

    expect(res.status).toBe(403);
    expect(softDeleteByIntegratorIdMock).not.toHaveBeenCalled();
  });

  it("returns 400 id_required for a blank integratorRecordId", async () => {
    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: gateCtx() });

    const res = await POST(req(), { params: Promise.resolve({ integratorRecordId: "   " }) });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("id_required");
    expect(softDeleteByIntegratorIdMock).not.toHaveBeenCalled();
  });

  it("scopes the delete to the caller's resolved organization inside the workspace principal", async () => {
    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: gateCtx("org-mine") });
    softDeleteByIntegratorIdMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return true;
    });

    const res = await POST(req(), { params: Promise.resolve({ integratorRecordId: RECORD_ID }) });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-mine" }),
      "admin.appointment-records.soft-delete",
      expect.any(Function),
    );
    expect(softDeleteByIntegratorIdMock).toHaveBeenCalledWith(RECORD_ID, { organizationId: "org-mine" });
    expect(emitBookingDeletedEventMock).toHaveBeenCalledTimes(1);
  });

  it("returns 404 not_found and skips the GCal event when the port refuses the delete (cross-org or missing)", async () => {
    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: gateCtx("org-mine") });
    softDeleteByIntegratorIdMock.mockResolvedValue(false);

    const res = await POST(req(), { params: Promise.resolve({ integratorRecordId: RECORD_ID }) });

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("not_found");
    expect(emitBookingDeletedEventMock).not.toHaveBeenCalled();
  });

  it("treats the best-effort GCal delete event failure as non-fatal", async () => {
    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: gateCtx() });
    softDeleteByIntegratorIdMock.mockResolvedValue(true);
    emitBookingDeletedEventMock.mockRejectedValue(new Error("gcal down"));

    const res = await POST(req(), { params: Promise.resolve({ integratorRecordId: RECORD_ID }) });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});

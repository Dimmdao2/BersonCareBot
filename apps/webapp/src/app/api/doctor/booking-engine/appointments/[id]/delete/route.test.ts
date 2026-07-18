import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
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
const staffPurgeCancelledAppointmentMock = vi.hoisted(() => vi.fn());

vi.mock("../../../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock("@/app-layer/booking/staffPurgeCancelledAppointment", () => ({
  staffPurgeCancelledAppointment: staffPurgeCancelledAppointmentMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(),
}));

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { POST } from "./route";

const APPT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function gateCtx() {
  return {
    organizationId: "org-1",
    session: { user: { userId: "u1", role: "doctor" } },
    service: { getRubitimeAppointmentId: vi.fn() },
  };
}

describe("POST delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
  });

  it("returns 403 when guard fails", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });

    const res = await POST(
      new Request("http://localhost/delete", { method: "POST" }),
      { params: Promise.resolve({ id: APPT_ID }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 503 when appointmentProjection unavailable", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({ ok: true, ctx: gateCtx() });
    vi.mocked(buildAppDeps).mockReturnValue({ appointmentProjection: null } as never);

    const res = await POST(
      new Request("http://localhost/delete", { method: "POST" }),
      { params: Promise.resolve({ id: APPT_ID }) },
    );
    const json = (await res.json()) as { error?: string };
    expect(res.status).toBe(503);
    expect(json.error).toBe("lifecycle_unavailable");
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it("returns 409 when appointment not cancelled", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({ ok: true, ctx: gateCtx() });
    vi.mocked(buildAppDeps).mockReturnValue({ appointmentProjection: {} } as never);
    staffPurgeCancelledAppointmentMock.mockResolvedValue({ ok: false, error: "not_cancelled" });

    const res = await POST(
      new Request("http://localhost/delete", { method: "POST" }),
      { params: Promise.resolve({ id: APPT_ID }) },
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 when appointment not found", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({ ok: true, ctx: gateCtx() });
    vi.mocked(buildAppDeps).mockReturnValue({ appointmentProjection: {} } as never);
    staffPurgeCancelledAppointmentMock.mockResolvedValue({ ok: false, error: "not_found" });

    const res = await POST(
      new Request("http://localhost/delete", { method: "POST" }),
      { params: Promise.resolve({ id: APPT_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful cancelled purge", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({ ok: true, ctx: gateCtx() });
    vi.mocked(buildAppDeps).mockReturnValue({ appointmentProjection: {} } as never);
    staffPurgeCancelledAppointmentMock.mockImplementation(async (input: {
      runLocalPurge: <T>(fn: () => Promise<T>) => Promise<T>;
    }) =>
      input.runLocalPurge(async () => {
        expect(principalState.inside).toBe(true);
        return { ok: true };
      }),
    );

    const res = await POST(
      new Request("http://localhost/delete", { method: "POST" }),
      { params: Promise.resolve({ id: APPT_ID }) },
    );
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "doctor.booking-engine.appointments.cancelled-purge",
      expect.any(Function),
    );
    expect(principalState.inside).toBe(false);
  });

  it("does not expose a Rubitime flag after canonical purge", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({ ok: true, ctx: gateCtx() });
    vi.mocked(buildAppDeps).mockReturnValue({ appointmentProjection: {} } as never);
    staffPurgeCancelledAppointmentMock.mockResolvedValue({ ok: true });

    const res = await POST(
      new Request("http://localhost/delete", { method: "POST" }),
      { params: Promise.resolve({ id: APPT_ID }) },
    );
    const json = (await res.json()) as { ok?: boolean; rubitimeMirrorFailed?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.rubitimeMirrorFailed).toBeUndefined();
  });
});

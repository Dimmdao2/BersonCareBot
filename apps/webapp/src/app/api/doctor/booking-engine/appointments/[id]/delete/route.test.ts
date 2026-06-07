import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const staffPurgeCancelledAppointmentMock = vi.hoisted(() => vi.fn());

vi.mock("../../../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
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
    staffPurgeCancelledAppointmentMock.mockResolvedValue({ ok: true });

    const res = await POST(
      new Request("http://localhost/delete", { method: "POST" }),
      { params: Promise.resolve({ id: APPT_ID }) },
    );
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it("returns 200 with rubitimeMirrorFailed flag", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({ ok: true, ctx: gateCtx() });
    vi.mocked(buildAppDeps).mockReturnValue({ appointmentProjection: {} } as never);
    staffPurgeCancelledAppointmentMock.mockResolvedValue({ ok: true, rubitimeMirrorFailed: true });

    const res = await POST(
      new Request("http://localhost/delete", { method: "POST" }),
      { params: Promise.resolve({ id: APPT_ID }) },
    );
    const json = (await res.json()) as { ok?: boolean; rubitimeMirrorFailed?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.rubitimeMirrorFailed).toBe(true);
  });
});

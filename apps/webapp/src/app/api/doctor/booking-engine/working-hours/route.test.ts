import { describe, expect, it, vi, beforeEach } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

const listWorkingHoursAdminMock = vi.hoisted(() => vi.fn());
const usesWorkingHoursFallbackMock = vi.hoisted(() => vi.fn());
const createWorkingHoursMock = vi.hoisted(() => vi.fn());
const updateWorkingHoursMock = vi.hoisted(() => vi.fn());
const deactivateWorkingHoursMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      listWorkingHoursAdmin: listWorkingHoursAdminMock,
      usesWorkingHoursFallback: usesWorkingHoursFallbackMock,
      createWorkingHours: createWorkingHoursMock,
      updateWorkingHours: updateWorkingHoursMock,
      deactivateWorkingHours: deactivateWorkingHoursMock,
    },
  }),
}));

import { GET, POST, PATCH, DELETE } from "./route";

const OWN_SPECIALIST = "518ea988-9b5e-4ad8-8194-a2d98f43bd7b";
const OTHER_ROW_ID = "22222222-2222-4222-8222-222222222222";
const OWN_ROW_ID = "11111111-1111-4111-8111-111111111111";

/** Gate resolves to a doctor context whose org has a single active specialist (the owner). */
function mockGateWithSpecialist(specialists: { id: string; isActive: boolean }[]) {
  requireDoctorBookingEngineMock.mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: "org-1",
      service: { catalog: { listSpecialists: vi.fn().mockResolvedValue(specialists) } },
    },
  });
}

describe("/api/doctor/booking-engine/working-hours (self-scope)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET forces the doctor's own specialist and ignores a client-supplied specialistId", async () => {
    mockGateWithSpecialist([{ id: OWN_SPECIALIST, isActive: true }]);
    listWorkingHoursAdminMock.mockResolvedValue([]);
    usesWorkingHoursFallbackMock.mockResolvedValue(false);

    // Client tries to read ANOTHER specialist's rows — must be overridden to own id.
    const res = await GET(
      new Request("http://localhost/api/doctor/booking-engine/working-hours?specialistId=99999999-9999-4999-8999-999999999999"),
    );
    expect(res.status).toBe(200);
    expect(listWorkingHoursAdminMock).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: OWN_SPECIALIST }),
    );
  });

  it("POST forces own specialist (body specialistId is ignored)", async () => {
    mockGateWithSpecialist([{ id: OWN_SPECIALIST, isActive: true }]);
    createWorkingHoursMock.mockResolvedValue({ id: "wh-new" });

    const res = await POST(
      new Request("http://localhost/api/doctor/booking-engine/working-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekday: 1,
          startMinute: 540,
          endMinute: 1080,
          // Attacker-supplied foreign specialist — must NOT reach the service.
          specialistId: "99999999-9999-4999-8999-999999999999",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(createWorkingHoursMock).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: OWN_SPECIALIST }),
    );
  });

  it("PATCH rejects a row that does not belong to the doctor's specialist (403, no update)", async () => {
    mockGateWithSpecialist([{ id: OWN_SPECIALIST, isActive: true }]);
    // Ownership probe: own specialist has only OWN_ROW_ID.
    listWorkingHoursAdminMock.mockResolvedValue([{ id: OWN_ROW_ID }]);

    const res = await PATCH(
      new Request("http://localhost/api/doctor/booking-engine/working-hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: OTHER_ROW_ID, startMinute: 540, endMinute: 1020 }),
      }),
    );
    expect(res.status).toBe(403);
    expect(updateWorkingHoursMock).not.toHaveBeenCalled();
  });

  it("PATCH updates a row that belongs to the doctor's specialist", async () => {
    mockGateWithSpecialist([{ id: OWN_SPECIALIST, isActive: true }]);
    listWorkingHoursAdminMock.mockResolvedValue([{ id: OWN_ROW_ID }]);
    updateWorkingHoursMock.mockResolvedValue({ id: OWN_ROW_ID });

    const res = await PATCH(
      new Request("http://localhost/api/doctor/booking-engine/working-hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: OWN_ROW_ID, startMinute: 540, endMinute: 1020 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateWorkingHoursMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: OWN_ROW_ID, organizationId: "org-1" }),
    );
  });

  it("DELETE rejects a row not owned by the doctor's specialist (403, no deactivate)", async () => {
    mockGateWithSpecialist([{ id: OWN_SPECIALIST, isActive: true }]);
    listWorkingHoursAdminMock.mockResolvedValue([{ id: OWN_ROW_ID }]);

    const res = await DELETE(
      new Request(`http://localhost/api/doctor/booking-engine/working-hours?id=${OTHER_ROW_ID}`),
    );
    expect(res.status).toBe(403);
    expect(deactivateWorkingHoursMock).not.toHaveBeenCalled();
  });

  it("DELETE deactivates an owned row", async () => {
    mockGateWithSpecialist([{ id: OWN_SPECIALIST, isActive: true }]);
    listWorkingHoursAdminMock.mockResolvedValue([{ id: OWN_ROW_ID }]);

    const res = await DELETE(
      new Request(`http://localhost/api/doctor/booking-engine/working-hours?id=${OWN_ROW_ID}`),
    );
    expect(res.status).toBe(200);
    expect(deactivateWorkingHoursMock).toHaveBeenCalledWith(OWN_ROW_ID, "org-1");
  });

  it("returns 409 when the org has no specialist configured", async () => {
    mockGateWithSpecialist([]);

    const res = await GET(new Request("http://localhost/api/doctor/booking-engine/working-hours"));
    const json = (await res.json()) as { error?: string };
    expect(res.status).toBe(409);
    expect(json.error).toBe("specialist_not_configured");
    expect(listWorkingHoursAdminMock).not.toHaveBeenCalled();
  });
});

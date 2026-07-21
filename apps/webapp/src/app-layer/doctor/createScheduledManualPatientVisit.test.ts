import { beforeEach, describe, expect, it, vi } from "vitest";

const fireAndForgetContactEmailSetupMock = vi.hoisted(() => vi.fn());
const trustedPatientPhoneWriteAnchorMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/emailSetupAccess/enqueueContactEmailSetup", () => ({
  fireAndForgetContactEmailSetup: fireAndForgetContactEmailSetupMock,
}));
vi.mock("@/modules/platform-access/trustedPhonePolicy", () => ({
  TrustedPatientPhoneSource: { DoctorStaffClientCreate: "doctor_staff_client_create" },
  trustedPatientPhoneWriteAnchor: trustedPatientPhoneWriteAnchorMock,
}));

import {
  createScheduledManualPatientVisit,
  createWalkInManualPatientVisit,
} from "./createScheduledManualPatientVisit";

const createManualPatientVisit = vi.fn();
const emailSetupAccess = { requestContactEmailSetup: vi.fn() };
const baseInput = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  requestId: "77777777-7777-4777-8777-777777777777",
  createdByUserId: "22222222-2222-4222-8222-222222222222",
  lastName: " новый ",
  firstName: " пациент ",
  patronymic: null,
  phone: "+7 999 000-00-00",
  email: "NEW@Example.com",
  appointment: {
    specialistId: "33333333-3333-4333-8333-333333333333",
    startAt: "2026-07-20T10:00:00.000Z",
    endAt: "2026-07-20T11:00:00.000Z",
    durationMinutes: 60,
    source: "admin_manual" as const,
    status: "confirmed" as const,
  },
};

describe("createScheduledManualPatientVisit", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("normalizes identity input and calls only the atomic domain command", async () => {
    createManualPatientVisit.mockResolvedValue({
      kind: "scheduled",
      replayed: false,
      clinicalVisitId: null,
      portalStatus: "not_activated",
      patient: {
        userId: "44444444-4444-4444-8444-444444444444",
        displayName: "Новый пациент",
        lastName: "Новый",
        firstName: "Пациент",
        patronymic: null,
        phoneNormalized: "+79990000000",
        created: true,
      },
      appointment: { id: "55555555-5555-4555-8555-555555555555" },
    });

    await expect(
      createScheduledManualPatientVisit(baseInput, {
        bookingEngine: { createManualPatientVisit },
        emailSetupAccess,
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(createManualPatientVisit).toHaveBeenCalledWith({
      organizationId: baseInput.organizationId,
      commandId: baseInput.requestId,
      lastName: "Новый",
      firstName: "Пациент",
      patronymic: null,
      phoneNormalized: "+79990000000",
      emailRaw: "NEW@Example.com",
      emailNormalized: "new@example.com",
      kind: "scheduled",
      appointment: baseInput.appointment,
    });
    expect(trustedPatientPhoneWriteAnchorMock).toHaveBeenCalledOnce();
    expect(fireAndForgetContactEmailSetupMock).toHaveBeenCalledOnce();
  });

  it("creates a scheduled contactless patient without phone trust or email setup", async () => {
    createManualPatientVisit.mockResolvedValue({
      kind: "scheduled",
      replayed: false,
      clinicalVisitId: null,
      portalStatus: "not_activated",
      patient: {
        userId: "44444444-4444-4444-8444-444444444444",
        displayName: "Новый Пациент",
        lastName: "Новый",
        firstName: "Пациент",
        patronymic: null,
        phoneNormalized: null,
        created: true,
      },
      appointment: { id: "55555555-5555-4555-8555-555555555555" },
    });

    await expect(
      createScheduledManualPatientVisit(
        { ...baseInput, phone: null, email: null },
        { bookingEngine: { createManualPatientVisit }, emailSetupAccess },
      ),
    ).resolves.toMatchObject({ ok: true, portalStatus: "not_activated" });
    expect(createManualPatientVisit).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNormalized: null, emailRaw: null, emailNormalized: null }),
    );
    expect(trustedPatientPhoneWriteAnchorMock).not.toHaveBeenCalled();
    expect(fireAndForgetContactEmailSetupMock).not.toHaveBeenCalled();
  });

  it("rejects malformed identity input before opening the atomic command", async () => {
    await expect(
      createScheduledManualPatientVisit(
        { ...baseInput, phone: "bad" },
        { bookingEngine: { createManualPatientVisit }, emailSetupAccess },
      ),
    ).resolves.toEqual({ ok: false, error: "invalid_phone" });
    expect(createManualPatientVisit).not.toHaveBeenCalled();
  });

  it("uses the same structured identity command for a walk-in without granting portal access", async () => {
    createManualPatientVisit.mockResolvedValue({
      kind: "walk_in",
      replayed: false,
      clinicalVisitId: "55555555-5555-4555-8555-555555555555",
      portalStatus: "not_activated",
      patient: {
        userId: "44444444-4444-4444-8444-444444444444",
        displayName: "Новый пациент",
        lastName: "Новый",
        firstName: "Пациент",
        patronymic: null,
        phoneNormalized: "+79990000000",
        created: true,
      },
      appointment: null,
    });

    await expect(
      createWalkInManualPatientVisit(
        {
          ...baseInput,
          specialistId: baseInput.appointment.specialistId,
          visitedAt: "2026-07-20T09:30:00.000Z",
        },
        { bookingEngine: { createManualPatientVisit }, emailSetupAccess },
      ),
    ).resolves.toMatchObject({ ok: true, kind: "walk_in", portalStatus: "not_activated" });

    expect(createManualPatientVisit).toHaveBeenCalledWith({
      organizationId: baseInput.organizationId,
      commandId: baseInput.requestId,
      lastName: "Новый",
      firstName: "Пациент",
      patronymic: null,
      phoneNormalized: "+79990000000",
      emailRaw: "NEW@Example.com",
      emailNormalized: "new@example.com",
      kind: "walk_in",
      walkIn: {
        specialistId: baseInput.appointment.specialistId,
        visitedAt: "2026-07-20T09:30:00.000Z",
        actorId: baseInput.createdByUserId,
      },
    });
  });

  it("rejects a walk-in more than two minutes in the future", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T09:30:00.000Z"));

    await expect(
      createWalkInManualPatientVisit(
        {
          ...baseInput,
          specialistId: baseInput.appointment.specialistId,
          visitedAt: "2026-07-20T09:32:01.000Z",
        },
        { bookingEngine: { createManualPatientVisit }, emailSetupAccess },
      ),
    ).resolves.toEqual({ ok: false, error: "visit_in_future" });
    expect(createManualPatientVisit).not.toHaveBeenCalled();
  });

  it("allows the explicit two-minute clock tolerance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T09:30:00.000Z"));
    createManualPatientVisit.mockResolvedValue({
      kind: "walk_in",
      replayed: false,
      clinicalVisitId: "55555555-5555-4555-8555-555555555555",
      portalStatus: "not_activated",
      patient: {
        userId: "44444444-4444-4444-8444-444444444444",
        displayName: "Новый пациент",
        lastName: "Новый",
        firstName: "Пациент",
        patronymic: null,
        phoneNormalized: "+79990000000",
        created: true,
      },
      appointment: null,
    });

    await expect(
      createWalkInManualPatientVisit(
        {
          ...baseInput,
          specialistId: baseInput.appointment.specialistId,
          visitedAt: "2026-07-20T09:32:00.000Z",
        },
        { bookingEngine: { createManualPatientVisit }, emailSetupAccess },
      ),
    ).resolves.toMatchObject({ ok: true, kind: "walk_in" });
  });
});

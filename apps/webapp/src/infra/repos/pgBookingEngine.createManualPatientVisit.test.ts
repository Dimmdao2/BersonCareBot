import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beAppointmentEvents,
  beAppointmentHistoryEvents,
  beAppointments,
  bePatientTimelineEvents,
} from "../../../db/schema/bookingEngine";

const getDrizzleMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn());
const resolveIdentityMock = vi.hoisted(() => vi.fn());
const ensureRelationshipMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: getDrizzleMock }));
vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
}));
vi.mock("@/infra/repos/pgDoctorClientCreate", () => ({
  resolveOrCreateDoctorClientByPhoneInTransaction: resolveIdentityMock,
}));
vi.mock("@/infra/repos/pgPatientOrganizationEnrollment", () => ({
  ensureInvitedOrganizationClientRelationship: ensureRelationshipMock,
}));

import { createPgBookingEnginePort } from "./pgBookingEngine";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const PATIENT_ID = "22222222-2222-4222-8222-222222222222";
const APPOINTMENT_ID = "33333333-3333-4333-8333-333333333333";

const input = {
  organizationId: ORG_ID,
  displayName: "Новый пациент",
  phoneNormalized: "+79990000000",
  emailRaw: null,
  emailNormalized: null,
  appointment: {
    branchId: "44444444-4444-4444-8444-444444444444",
    specialistId: "55555555-5555-4555-8555-555555555555",
    serviceId: "66666666-6666-4666-8666-666666666666",
    startAt: "2026-07-20T10:00:00.000Z",
    endAt: "2026-07-20T11:00:00.000Z",
    durationMinutes: 60,
    source: "admin_manual" as const,
    status: "confirmed" as const,
    actorId: "77777777-7777-4777-8777-777777777777",
  },
};

function appointmentRow() {
  return {
    id: APPOINTMENT_ID,
    organizationId: ORG_ID,
    branchId: input.appointment.branchId,
    roomId: null,
    specialistId: input.appointment.specialistId,
    serviceId: input.appointment.serviceId,
    platformUserId: PATIENT_ID,
    startAt: input.appointment.startAt,
    endAt: input.appointment.endAt,
    durationMinutes: 60,
    chainId: null,
    chainPosition: null,
    source: "admin_manual",
    status: "confirmed",
    originalStartAt: input.appointment.startAt,
    rescheduleCount: 0,
    paymentRef: null,
    packageUsageRef: null,
    phoneNormalized: input.phoneNormalized,
    attributionJson: {},
  };
}

describe("pgBookingEngine.createManualPatientVisit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_ID);
    resolveIdentityMock.mockResolvedValue({
      userId: PATIENT_ID,
      displayName: input.displayName,
      phoneNormalized: input.phoneNormalized,
      created: true,
    });
    ensureRelationshipMock.mockResolvedValue("invited");
  });

  it("runs identity, invited relationship and appointment writers inside one outer transaction", async () => {
    const insertOrder: string[] = [];
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn(() => {
        if (table === beAppointments) {
          insertOrder.push("appointment");
          return { returning: async () => [appointmentRow()] };
        }
        if (table === beAppointmentEvents) insertOrder.push("event");
        if (table === beAppointmentHistoryEvents) insertOrder.push("history");
        if (table === bePatientTimelineEvents) insertOrder.push("timeline");
        return Promise.resolve();
      }),
    }));
    const tx = { insert };
    const transaction = vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx));
    getDrizzleMock.mockReturnValue({ transaction });

    const result = await createPgBookingEnginePort().createManualPatientVisit(input);

    expect(transaction).toHaveBeenCalledOnce();
    expect(resolveIdentityMock).toHaveBeenCalledWith(tx, ORG_ID, input);
    expect(ensureRelationshipMock).toHaveBeenCalledWith(tx, ORG_ID, PATIENT_ID);
    expect(insertOrder).toEqual(["appointment", "event", "history", "timeline"]);
    expect(result.appointment.id).toBe(APPOINTMENT_ID);
  });

  it("propagates appointment failure from the same callback so the outer transaction rolls back all prior writes", async () => {
    const appointmentFailure = new Error("slot_overlap");
    const tx = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn(() => {
          if (table === beAppointments) throw appointmentFailure;
          return Promise.resolve();
        }),
      })),
    };
    const transaction = vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx));
    getDrizzleMock.mockReturnValue({ transaction });

    await expect(createPgBookingEnginePort().createManualPatientVisit(input)).rejects.toBe(
      appointmentFailure,
    );
    expect(resolveIdentityMock).toHaveBeenCalledOnce();
    expect(ensureRelationshipMock).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledOnce();
  });

  it("rejects a mismatched organization before opening the transaction", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue("foreign-org");
    await expect(createPgBookingEnginePort().createManualPatientVisit(input)).rejects.toThrow(
      "organization_principal_mismatch",
    );
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });
});

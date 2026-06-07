import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  inMemoryAppointmentProjectionPort,
  resetInMemoryAppointmentProjectionState,
} from "@/infra/repos/inMemoryAppointmentProjection";
import { staffPurgeCancelledAppointment } from "./staffPurgeCancelledAppointment";

const emitBookingDeletedEventMock = vi.hoisted(() => vi.fn());
const isStaffRubitimeOutboundEnabledMock = vi.hoisted(() => vi.fn());
const createBookingSyncPortMock = vi.hoisted(() => vi.fn());
const resolveRubitimeIdForAppointmentMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/booking/emitBookingDeletedEvent", () => ({
  emitBookingDeletedEvent: emitBookingDeletedEventMock,
}));

vi.mock("@/app-layer/booking/staffRubitimeBridgePolicy", () => ({
  isStaffRubitimeOutboundEnabled: isStaffRubitimeOutboundEnabledMock,
}));

vi.mock("@/app-layer/booking/staffRubitimeMirrorOutbound", () => ({
  resolveRubitimeIdForAppointment: resolveRubitimeIdForAppointmentMock,
}));

vi.mock("@/modules/integrator/bookingM2mApi", () => ({
  createBookingSyncPort: createBookingSyncPortMock,
}));

const deleteRecordMock = vi.fn();
const getAppointmentMock = vi.fn();
const getBookingByCanonicalAppointmentMock = vi.fn();

function deps() {
  return {
    bookingEngine: { getAppointment: getAppointmentMock },
    appointmentProjection: inMemoryAppointmentProjectionPort,
    patientBooking: { getBookingByCanonicalAppointment: getBookingByCanonicalAppointmentMock },
    appointmentMirrorSync: null,
    systemSettings: { getSetting: vi.fn() },
  } as never;
}

const APPT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("staffPurgeCancelledAppointment", () => {
  beforeEach(() => {
    resetInMemoryAppointmentProjectionState();
    emitBookingDeletedEventMock.mockReset();
    isStaffRubitimeOutboundEnabledMock.mockReset();
    createBookingSyncPortMock.mockReset();
    resolveRubitimeIdForAppointmentMock.mockReset();
    deleteRecordMock.mockReset();
    getAppointmentMock.mockReset();
    getBookingByCanonicalAppointmentMock.mockReset();

    createBookingSyncPortMock.mockReturnValue({ deleteRecord: deleteRecordMock });
    isStaffRubitimeOutboundEnabledMock.mockResolvedValue(true);
    resolveRubitimeIdForAppointmentMock.mockImplementation(async () => "rt-1");
    getBookingByCanonicalAppointmentMock.mockResolvedValue(null);
    deleteRecordMock.mockResolvedValue(undefined);
    emitBookingDeletedEventMock.mockResolvedValue(undefined);
  });

  it("returns not_cancelled for confirmed appointment", async () => {
    getAppointmentMock.mockResolvedValue({
      id: APPT_ID,
      organizationId: "org-1",
      status: "confirmed",
      startAt: "2026-06-01T10:00:00.000Z",
    });

    const result = await staffPurgeCancelledAppointment({
      deps: deps(),
      organizationId: "org-1",
      appointmentId: APPT_ID,
      actorId: "u1",
    });

    expect(result).toEqual({ ok: false, error: "not_cancelled" });
    expect(deleteRecordMock).not.toHaveBeenCalled();
    expect(emitBookingDeletedEventMock).not.toHaveBeenCalled();
  });

  it("returns not_cancelled for no_show", async () => {
    getAppointmentMock.mockResolvedValue({
      id: APPT_ID,
      organizationId: "org-1",
      status: "no_show",
      startAt: "2026-06-01T10:00:00.000Z",
    });

    const result = await staffPurgeCancelledAppointment({
      deps: deps(),
      organizationId: "org-1",
      appointmentId: APPT_ID,
      actorId: "u1",
    });

    expect(result).toEqual({ ok: false, error: "not_cancelled" });
  });

  it("purges cancelled appointment and emits booking.deleted only", async () => {
    getAppointmentMock.mockResolvedValue({
      id: APPT_ID,
      organizationId: "org-1",
      status: "cancelled_by_specialist",
      startAt: "2026-06-01T10:00:00.000Z",
    });
    await inMemoryAppointmentProjectionPort.upsertRecordFromProjection({
      integratorRecordId: "rt-1",
      phoneNormalized: "+79990000000",
      recordAt: "2026-06-01T10:00:00.000Z",
      status: "cancelled",
      payloadJson: {},
      lastEvent: "native.cancelled",
      updatedAt: new Date().toISOString(),
    });

    const result = await staffPurgeCancelledAppointment({
      deps: deps(),
      organizationId: "org-1",
      appointmentId: APPT_ID,
      actorId: "u1",
    });

    expect(result).toEqual({ ok: true });
    expect(deleteRecordMock).toHaveBeenCalledWith("rt-1");
    expect(emitBookingDeletedEventMock).toHaveBeenCalledTimes(1);
    const purged = await inMemoryAppointmentProjectionPort.isIntegratorRecordPurged("rt-1");
    expect(purged).toBe(true);
  });

  it("is idempotent when already purged", async () => {
    getAppointmentMock.mockResolvedValue({
      id: APPT_ID,
      organizationId: "org-1",
      status: "cancelled_by_patient",
      startAt: "2026-06-01T10:00:00.000Z",
    });
    await inMemoryAppointmentProjectionPort.upsertRecordFromProjection({
      integratorRecordId: `be:${APPT_ID}`,
      phoneNormalized: "+79990000000",
      recordAt: "2026-06-01T10:00:00.000Z",
      status: "cancelled",
      payloadJson: {},
      lastEvent: "native.cancelled",
      updatedAt: new Date().toISOString(),
    });
    await inMemoryAppointmentProjectionPort.softDeleteByCanonicalAppointmentId(APPT_ID, null);

    const result = await staffPurgeCancelledAppointment({
      deps: deps(),
      organizationId: "org-1",
      appointmentId: APPT_ID,
      actorId: "u1",
    });

    expect(result).toEqual({ ok: true });
    expect(emitBookingDeletedEventMock).toHaveBeenCalled();
  });

  it("returns not_found when appointment missing", async () => {
    getAppointmentMock.mockResolvedValue(null);

    const result = await staffPurgeCancelledAppointment({
      deps: deps(),
      organizationId: "org-1",
      appointmentId: APPT_ID,
      actorId: "u1",
    });

    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("skips remove-record when Rubitime bridge is off", async () => {
    isStaffRubitimeOutboundEnabledMock.mockResolvedValue(false);
    getAppointmentMock.mockResolvedValue({
      id: APPT_ID,
      organizationId: "org-1",
      status: "cancelled_by_specialist",
      startAt: "2026-06-01T10:00:00.000Z",
    });
    await inMemoryAppointmentProjectionPort.upsertRecordFromProjection({
      integratorRecordId: "rt-1",
      phoneNormalized: "+79990000000",
      recordAt: "2026-06-01T10:00:00.000Z",
      status: "cancelled",
      payloadJson: {},
      lastEvent: "native.cancelled",
      updatedAt: new Date().toISOString(),
    });

    const result = await staffPurgeCancelledAppointment({
      deps: deps(),
      organizationId: "org-1",
      appointmentId: APPT_ID,
      actorId: "u1",
    });

    expect(result).toEqual({ ok: true });
    expect(deleteRecordMock).not.toHaveBeenCalled();
    expect(emitBookingDeletedEventMock).toHaveBeenCalledTimes(1);
  });

  it("purges via tombstone when projection row is missing", async () => {
    getAppointmentMock.mockResolvedValue({
      id: APPT_ID,
      organizationId: "org-1",
      status: "cancelled_by_patient",
      startAt: "2026-06-01T10:00:00.000Z",
    });

    const result = await staffPurgeCancelledAppointment({
      deps: deps(),
      organizationId: "org-1",
      appointmentId: APPT_ID,
      actorId: "u1",
    });

    expect(result).toEqual({ ok: true });
    expect(
      await inMemoryAppointmentProjectionPort.isIntegratorRecordPurged(`be:${APPT_ID}`),
    ).toBe(true);
  });

  it("returns rubitimeMirrorFailed when remove-record throws", async () => {
    getAppointmentMock.mockResolvedValue({
      id: APPT_ID,
      organizationId: "org-1",
      status: "late_cancellation",
      startAt: "2026-06-01T10:00:00.000Z",
    });
    resolveRubitimeIdForAppointmentMock.mockResolvedValue("rt-2");
    await inMemoryAppointmentProjectionPort.upsertRecordFromProjection({
      integratorRecordId: "rt-2",
      phoneNormalized: "+79990000000",
      recordAt: "2026-06-01T10:00:00.000Z",
      status: "cancelled",
      payloadJson: {},
      lastEvent: "native.cancelled",
      updatedAt: new Date().toISOString(),
    });
    deleteRecordMock.mockRejectedValue(new Error("rubitime down"));

    const result = await staffPurgeCancelledAppointment({
      deps: deps(),
      organizationId: "org-1",
      appointmentId: APPT_ID,
      actorId: "u1",
    });

    expect(result).toEqual({ ok: true, rubitimeMirrorFailed: true });
  });
});

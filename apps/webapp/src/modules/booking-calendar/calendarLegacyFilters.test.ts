import { describe, expect, it } from "vitest";
import {
  dedupeCalendarAppointmentsPreferLegacy,
  matchesLegacyAppointmentScopeFilter,
} from "./calendarLegacyFilters";
import type { CalendarAppointmentEvent } from "./types";

function legacyEvent(overrides: Partial<CalendarAppointmentEvent> = {}): CalendarAppointmentEvent {
  return {
    kind: "appointment",
    id: "legacy-1",
    startAt: "2026-05-30T10:00:00.000Z",
    endAt: "2026-05-30T11:00:00.000Z",
    status: "confirmed",
    source: "rubitime_legacy",
    specialistId: null,
    specialistName: null,
    branchId: "b1",
    branchTitle: "Центр",
    roomId: null,
    roomTitle: null,
    serviceId: null,
    serviceTitle: null,
    platformUserId: null,
    patientName: "Иван",
    patientPhone: "+79001234567",
    bookingStatus: "created",
    rubitimeId: "rt-legacy-1",
    rubitimeManageUrl: null,
    paymentStatus: null,
    prepaymentPending: false,
    packageUsageRef: null,
    packageTitle: null,
    rescheduleCount: 0,
    originalStartAt: null,
    formComments: [],
    ...overrides,
  };
}

describe("calendarLegacyFilters", () => {
  it("soft-matches branch filter when legacy branchId is null", () => {
    const event = legacyEvent({ branchId: null });
    expect(
      matchesLegacyAppointmentScopeFilter(event, {
        organizationId: "org",
        rangeStart: "",
        rangeEnd: "",
        branchId: "b1",
      }),
    ).toBe(true);
  });

  it("excludes legacy event when branchId differs from filter", () => {
    const event = legacyEvent({ branchId: "b2" });
    expect(
      matchesLegacyAppointmentScopeFilter(event, {
        organizationId: "org",
        rangeStart: "",
        rangeEnd: "",
        branchId: "b1",
      }),
    ).toBe(false);
  });

  it("dedupes preferring rubitime_legacy over projection for same slot", () => {
    const legacy = legacyEvent({ id: "legacy-1", source: "rubitime_legacy" });
    const projection = legacyEvent({
      id: "canonical-1",
      source: "rubitime_projection",
    });
    const result = dedupeCalendarAppointmentsPreferLegacy([projection, legacy]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("legacy-1");
  });

  it("drops native be: row when Rubitime row exists for the same slot", () => {
    const rubitime = legacyEvent({ id: "rt-42", patientPhone: "+79001234567", patientName: "Иван" });
    const native = legacyEvent({
      id: "be:appt-uuid",
      patientPhone: "+79001234567",
      patientName: "Иван",
    });
    const result = dedupeCalendarAppointmentsPreferLegacy([native, rubitime]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("rt-42");
  });
});

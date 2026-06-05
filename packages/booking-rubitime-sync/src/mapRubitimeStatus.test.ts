import { describe, expect, it } from "vitest";
import { mapRubitimeStatusToBeAppointment } from "./mapRubitimeStatusToBeAppointment.js";
import { mapRubitimeStatusToPatientBookingStatus } from "./mapRubitimeStatus.js";
import { normalizeRubitimeStatus } from "./rubitimeNormalizedStatus.js";

describe("normalizeRubitimeStatus", () => {
  it.each([
    [0, "recorded"],
    [1, "in_service"],
    [2, "completed"],
    [3, "awaiting_prepayment"],
    [4, "canceled"],
    [5, "awaiting_confirmation"],
    [6, "in_cart"],
    [7, "moved_awaiting"],
  ] as const)("code %s -> %s", (code, expected) => {
    expect(normalizeRubitimeStatus(code)).toBe(expected);
  });
});

describe("mapRubitimeStatusToPatientBookingStatus", () => {
  it("maps normalized Rubitime statuses", () => {
    expect(mapRubitimeStatusToPatientBookingStatus("recorded")).toBe("confirmed");
    expect(mapRubitimeStatusToPatientBookingStatus("awaiting_prepayment")).toBe("awaiting_payment");
    expect(mapRubitimeStatusToPatientBookingStatus("moved_awaiting")).toBe("rescheduled");
    expect(mapRubitimeStatusToPatientBookingStatus("in_cart")).toBe("creating");
  });

  it("maps legacy appointment projection statuses via payload", () => {
    expect(
      mapRubitimeStatusToPatientBookingStatus("updated", {
        legacyEventStatus: "updated",
        payloadJson: { status: "7" },
      }),
    ).toBe("rescheduled");
  });

  it("maps Russian cancelled labels", () => {
    expect(mapRubitimeStatusToPatientBookingStatus("Отменен клиентом")).toBe("cancelled");
  });
});

describe("mapRubitimeStatusToBeAppointment", () => {
  it("maps normalized Rubitime statuses to be_appointments", () => {
    expect(mapRubitimeStatusToBeAppointment("recorded", "created")).toBe("confirmed");
    expect(mapRubitimeStatusToBeAppointment("awaiting_prepayment", "updated")).toBe("awaiting_payment");
    expect(mapRubitimeStatusToBeAppointment("awaiting_confirmation", "updated")).toBe(
      "manual_review_required",
    );
    expect(mapRubitimeStatusToBeAppointment("moved_awaiting", "updated")).toBe("rescheduled");
    expect(mapRubitimeStatusToBeAppointment("completed", "updated")).toBe("completed");
    expect(mapRubitimeStatusToBeAppointment("canceled", "canceled")).toBe("cancelled_by_patient");
  });

  it("reads rubitime status from payload when legacy row is updated", () => {
    expect(
      mapRubitimeStatusToBeAppointment("updated", "updated", {
        rubitime_normalized_status: "moved_awaiting",
      }),
    ).toBe("rescheduled");
  });
});

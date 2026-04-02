import { describe, expect, it } from "vitest";
import { mapBookingCreateErrorCodeToRu } from "./bookingCreateErrorMessages";

describe("mapBookingCreateErrorCodeToRu", () => {
  it("maps slot conflict codes", () => {
    expect(mapBookingCreateErrorCodeToRu("slot_overlap")).toContain("уже занято");
    expect(mapBookingCreateErrorCodeToRu("slot_already_taken")).toContain("уже занято");
  });

  it("maps rubitime and confirm failures", () => {
    expect(mapBookingCreateErrorCodeToRu("booking_confirm_failed")).toContain("подтвердить");
    expect(mapBookingCreateErrorCodeToRu("rubitime_slots_failed")).toContain("подтвердить");
    expect(mapBookingCreateErrorCodeToRu("integrator_not_configured")).toContain("подтвердить");
  });

  it("maps business validation codes", () => {
    expect(mapBookingCreateErrorCodeToRu("branch_service_not_found")).toContain("недоступны");
    expect(mapBookingCreateErrorCodeToRu("city_mismatch")).toContain("Город");
  });

  it("fallback for unknown code", () => {
    expect(mapBookingCreateErrorCodeToRu("unknown_xyz")).toBe("Не удалось создать запись.");
  });
});

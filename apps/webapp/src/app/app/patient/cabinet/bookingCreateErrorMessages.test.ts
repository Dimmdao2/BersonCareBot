import { describe, expect, it } from "vitest";
import { mapBookingCreateErrorCodeToRu } from "./bookingCreateErrorMessages";

describe("mapBookingCreateErrorCodeToRu", () => {
  it("maps booking_phone_trust_required", () => {
    expect(mapBookingCreateErrorCodeToRu("booking_phone_trust_required")).toContain("привязки");
  });
});

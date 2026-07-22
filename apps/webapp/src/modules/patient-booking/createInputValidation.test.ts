import { describe, expect, it } from "vitest";
import { validateCreatePatientBookingInput } from "./createInputValidation";

const base = {
  userId: "u1",
  type: "in_person" as const,
  branchId: "550e8400-e29b-41d4-a716-446655440001",
  serviceId: "550e8400-e29b-41d4-a716-446655440002",
  cityCode: "Moscow",
  slotStart: "2026-06-01T10:00:00.000Z",
  slotEnd: "2026-06-01T11:00:00.000Z",
  contactName: " Иван ",
  contactPhone: " +79990001122 ",
};

describe("validateCreatePatientBookingInput", () => {
  it("normalizes canonical in-person keys", () => {
    expect(validateCreatePatientBookingInput(base)).toMatchObject({ branchId: base.branchId, serviceId: base.serviceId, cityCode: "moscow" });
  });

  it("rejects malformed canonical keys", () => {
    expect(() => validateCreatePatientBookingInput({ ...base, branchId: "not-uuid" })).toThrow("invalid_in_person_keys");
  });
});

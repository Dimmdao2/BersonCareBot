import { describe, expect, it } from "vitest";
import { validateCreatePatientBookingInput } from "./createInputValidation";

describe("validateCreatePatientBookingInput", () => {
  const baseOnline = {
    userId: "u1",
    type: "online" as const,
    category: "general" as const,
    slotStart: "2026-05-01T10:00:00.000Z",
    slotEnd: "2026-05-01T11:00:00.000Z",
    contactName: "Ann",
    contactPhone: "+79990001122",
  };

  it("accepts valid online payload", () => {
    const v = validateCreatePatientBookingInput(baseOnline);
    expect(v.type).toBe("online");
    expect(v.contactName).toBe("Ann");
  });

  it("rejects in_person without UUID branchServiceId", () => {
    expect(() =>
      validateCreatePatientBookingInput({
        userId: "u1",
        type: "in_person",
        branchServiceId: "not-uuid",
        cityCode: "moscow",
        slotStart: baseOnline.slotStart,
        slotEnd: baseOnline.slotEnd,
        contactName: "Ann",
        contactPhone: "+79990001122",
      }),
    ).toThrow("invalid_branch_service_id");
  });

  it("rejects empty cityCode for in_person", () => {
    expect(() =>
      validateCreatePatientBookingInput({
        userId: "u1",
        type: "in_person",
        branchServiceId: "11111111-1111-4111-8111-111111111111",
        cityCode: "   ",
        slotStart: baseOnline.slotStart,
        slotEnd: baseOnline.slotEnd,
        contactName: "Ann",
        contactPhone: "+79990001122",
      }),
    ).toThrow("invalid_city_code");
  });

  it("normalizes cityCode to lowercase", () => {
    const v = validateCreatePatientBookingInput({
      userId: "u1",
      type: "in_person",
      branchServiceId: "11111111-1111-4111-8111-111111111111",
      cityCode: "Moscow",
      slotStart: baseOnline.slotStart,
      slotEnd: baseOnline.slotEnd,
      contactName: "Ann",
      contactPhone: "+79990001122",
    });
    expect(v.type).toBe("in_person");
    if (v.type === "in_person") expect(v.cityCode).toBe("moscow");
  });
});

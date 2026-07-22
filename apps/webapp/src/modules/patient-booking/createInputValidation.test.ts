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

const baseOnline = {
  userId: "u1",
  type: "online" as const,
  category: "general" as const,
  slotStart: "2026-05-01T10:00:00.000Z",
  slotEnd: "2026-05-01T11:00:00.000Z",
  contactName: "Ann",
  contactPhone: "+79990001122",
};

describe("validateCreatePatientBookingInput", () => {
  it("normalizes canonical in-person keys", () => {
    expect(validateCreatePatientBookingInput(base)).toMatchObject({ branchId: base.branchId, serviceId: base.serviceId, cityCode: "moscow" });
  });

  it("rejects malformed canonical keys", () => {
    expect(() => validateCreatePatientBookingInput({ ...base, branchId: "not-uuid" })).toThrow("invalid_in_person_keys");
  });

  it("accepts valid online payload", () => {
    const v = validateCreatePatientBookingInput(baseOnline);
    expect(v.type).toBe("online");
    expect(v.contactName).toBe("Ann");
  });

  it("trims structured contact FIO", () => {
    const v = validateCreatePatientBookingInput({
      ...baseOnline,
      contactName: " Иванов Иван ",
      contactFio: { lastName: " Иванов ", firstName: " Иван ", patronymic: " Иванович " },
    });
    expect(v.contactName).toBe("Иванов Иван");
    expect(v.contactFio).toEqual({ lastName: "Иванов", firstName: "Иван", patronymic: "Иванович" });
  });

  it("rejects incomplete structured contact FIO", () => {
    expect(() =>
      validateCreatePatientBookingInput({
        ...baseOnline,
        contactFio: { lastName: "", firstName: "Иван" },
      }),
    ).toThrow("invalid_contact_name");
  });

  it("rejects empty cityCode for in_person", () => {
    expect(() => validateCreatePatientBookingInput({ ...base, cityCode: "   " })).toThrow("invalid_city_code");
  });
});

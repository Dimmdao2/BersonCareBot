import { describe, expect, it } from "vitest";
import { validateBookingFormAnswers } from "./validateAnswers";
import type { BookingFormFieldRecord } from "./ports";

const fields: BookingFormFieldRecord[] = [
  {
    id: "1",
    organizationId: "org",
    fieldKey: "contact_name",
    fieldType: "first_name",
    label: "Имя",
    placeholder: null,
    isRequired: true,
    visibleToPatient: true,
    visibleToStaff: true,
    sortOrder: 0,
    isActive: true,
  },
  {
    id: "2",
    organizationId: "org",
    fieldKey: "comment",
    fieldType: "comment",
    label: "Комментарий",
    placeholder: null,
    isRequired: false,
    visibleToPatient: true,
    visibleToStaff: true,
    sortOrder: 1,
    isActive: true,
  },
];

describe("validateBookingFormAnswers", () => {
  it("rejects missing required field", () => {
    const r = validateBookingFormAnswers(fields, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("required_field_missing");
  });

  it("accepts prefill for required field", () => {
    const r = validateBookingFormAnswers(fields, [], { contact_name: "Иван" });
    expect(r).toEqual({ ok: true });
  });
});

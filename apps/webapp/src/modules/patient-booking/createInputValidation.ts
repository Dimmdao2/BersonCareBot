import type { CreatePatientBookingInput } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ensureIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("invalid_datetime");
  }
  return d.toISOString();
}

/**
 * Validates API-facing create payload. Throws `Error` with message = error code.
 */
export function validateCreatePatientBookingInput(input: CreatePatientBookingInput): CreatePatientBookingInput {
  const slotStart = ensureIso(input.slotStart);
  const slotEnd = ensureIso(input.slotEnd);
  if (new Date(slotEnd).getTime() <= new Date(slotStart).getTime()) {
    throw new Error("invalid_slot_range");
  }
  if (!input.contactName.trim()) throw new Error("invalid_contact_name");
  if (!input.contactPhone.trim()) throw new Error("invalid_contact_phone");

  if (input.type === "online") {
    return {
      ...input,
      slotStart,
      slotEnd,
      contactName: input.contactName.trim(),
      contactPhone: input.contactPhone.trim(),
      contactEmail: input.contactEmail?.trim() || undefined,
    };
  }

  const cityCode = input.cityCode.trim().toLowerCase();
  if (!cityCode) throw new Error("invalid_city_code");
  const bs = input.branchServiceId.trim();
  if (!UUID_RE.test(bs)) throw new Error("invalid_branch_service_id");

  return {
    ...input,
    cityCode,
    branchServiceId: bs,
    slotStart,
    slotEnd,
    contactName: input.contactName.trim(),
    contactPhone: input.contactPhone.trim(),
    contactEmail: input.contactEmail?.trim() || undefined,
  };
}

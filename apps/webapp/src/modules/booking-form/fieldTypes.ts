export const BOOKING_FORM_FIELD_TYPES = [
  'first_name',
  'last_name',
  'phone',
  'email',
  'comment',
  'problem_description',
  'complaint',
  'text',
  'free_text',
  'custom',
] as const;

export type BookingFormFieldType = (typeof BOOKING_FORM_FIELD_TYPES)[number];

/**
 * The stored machine key of a booking form field. The admin API rejects anything else, so the
 * screen that derives a key from a human (Russian) label must build it against this exact
 * contract instead of a shape the server will refuse.
 */
export const BOOKING_FORM_FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
export const BOOKING_FORM_FIELD_KEY_MAX_LENGTH = 80;

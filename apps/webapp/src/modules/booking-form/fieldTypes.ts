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

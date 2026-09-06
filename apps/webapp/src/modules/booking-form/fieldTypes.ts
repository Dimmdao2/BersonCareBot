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

export const SYSTEM_BOOKING_FORM_FIELDS = [
  {
    fieldKey: 'last_name',
    fieldType: 'last_name',
    label: 'Фамилия',
    isRequired: true,
    sortOrder: 10,
  },
  {
    fieldKey: 'first_name',
    fieldType: 'first_name',
    label: 'Имя',
    isRequired: true,
    sortOrder: 20,
  },
  {
    fieldKey: 'patronymic',
    fieldType: 'free_text',
    label: 'Отчество',
    isRequired: false,
    sortOrder: 30,
  },
  { fieldKey: 'phone', fieldType: 'phone', label: 'Телефон', isRequired: true, sortOrder: 40 },
  { fieldKey: 'email', fieldType: 'email', label: 'Email', isRequired: false, sortOrder: 50 },
  {
    fieldKey: 'comment',
    fieldType: 'comment',
    label: 'Комментарий',
    isRequired: false,
    sortOrder: 60,
  },
] as const;

const SYSTEM_FIELD_KEY_ALIASES: Readonly<Record<string, string>> = {
  contact_name: 'first_name',
  contact_phone: 'phone',
  contact_email: 'email',
};

export function canonicalBookingFormFieldKey(fieldKey: string): string {
  return SYSTEM_FIELD_KEY_ALIASES[fieldKey] ?? fieldKey;
}

export function isSystemBookingFormField(fieldKey: string): boolean {
  const canonicalKey = canonicalBookingFormFieldKey(fieldKey);
  return SYSTEM_BOOKING_FORM_FIELDS.some((field) => field.fieldKey === canonicalKey);
}

/**
 * The stored machine key of a booking form field. The admin API rejects anything else, so the
 * screen that derives a key from a human (Russian) label must build it against this exact
 * contract instead of a shape the server will refuse.
 */
export const BOOKING_FORM_FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
export const BOOKING_FORM_FIELD_KEY_MAX_LENGTH = 80;

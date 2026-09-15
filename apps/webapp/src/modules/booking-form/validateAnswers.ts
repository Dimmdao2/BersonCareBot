import { canonicalBookingFormFieldKey } from './fieldTypes';
import type { BookingFormFieldRecord, FormAnswerInput } from './ports';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Значения, которые клиника РАЗРЕШИЛА принять: ключ поля → проверенное значение. Ответы на поля,
 * которых в конфигурации арендатора нет или которые он выключил, сюда не попадают, и вызывающий
 * не имеет другого источника — поэтому клиент не может навязать серверу выключенное поле.
 */
export type AcceptedFormAnswers = ReadonlyMap<string, string>;

export function validateBookingFormAnswers(
  fields: BookingFormFieldRecord[],
  answers: FormAnswerInput[],
  profilePrefill: Record<string, string> = {},
):
  | { ok: true; accepted: AcceptedFormAnswers }
  | { ok: false; error: string; fieldKey?: string } {
  const answerMap = new Map(answers.map((a) => [a.fieldKey.trim(), a.value.trim()]));
  const accepted = new Map<string, string>();
  for (const field of fields.filter((f) => f.isActive)) {
    const fromAnswer = answerMap.get(field.fieldKey) ?? '';
    const fromProfile = profilePrefill[field.fieldKey] ?? profilePrefill[field.fieldType] ?? '';
    const value = (fromAnswer || fromProfile).trim();
    if (field.isRequired && !value) {
      return { ok: false, error: 'required_field_missing', fieldKey: field.fieldKey };
    }
    if (!value) continue;
    if (field.fieldType === 'email' && !EMAIL_RE.test(value)) {
      return { ok: false, error: 'invalid_email', fieldKey: field.fieldKey };
    }
    if (field.fieldType === 'phone' && value.replace(/\D/g, '').length < 10) {
      return { ok: false, error: 'invalid_phone', fieldKey: field.fieldKey };
    }
    accepted.set(canonicalBookingFormFieldKey(field.fieldKey), value);
  }
  return { ok: true, accepted };
}

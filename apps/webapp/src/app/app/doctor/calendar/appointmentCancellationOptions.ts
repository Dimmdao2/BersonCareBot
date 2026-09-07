import type { DoctorClientTerms } from '@/modules/system-settings/patientTerms';

export function appointmentCancelReasons(
  terms: Pick<DoctorClientTerms, 'patientSingularLabel'>,
) {
  return [
  { value: 'Пациент перенёс', label: `${terms.patientSingularLabel} перенёс` },
  { value: 'Пациент отменил', label: `${terms.patientSingularLabel} отменил` },
  { value: 'Не пришёл', label: 'Не пришёл' },
  { value: 'По состоянию здоровья', label: 'По состоянию здоровья' },
  { value: 'Другая', label: 'Другая' },
  ] as const;
}

export const APPOINTMENT_CANCEL_CHARGE_OPTIONS = [
  { value: 'free', label: 'Бесплатная' },
  { value: 'penalized', label: 'Штрафная' },
] as const;

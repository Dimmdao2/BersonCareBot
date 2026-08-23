export const APPOINTMENT_CANCEL_REASONS = [
  { value: 'Пациент перенёс', label: 'Пациент перенёс' },
  { value: 'Пациент отменил', label: 'Пациент отменил' },
  { value: 'Не пришёл', label: 'Не пришёл' },
  { value: 'По состоянию здоровья', label: 'По состоянию здоровья' },
  { value: 'Другая', label: 'Другая' },
] as const;

export const APPOINTMENT_CANCEL_CHARGE_OPTIONS = [
  { value: 'free', label: 'Бесплатная' },
  { value: 'penalized', label: 'Штрафная' },
] as const;

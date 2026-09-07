/**
 * Резолвер терминологии пациентов из настройки `patient_label` (scope=doctor).
 *
 * `patient_label` — двоичный тумблер: `"клиент"` → «Клиенты», всё остальное → «Пациенты».
 * Резолвер — единственное место логики; всё остальное импортирует отсюда.
 *
 * Нормализация: trim + toLowerCase, чтобы «Клиент» или «КЛИЕНТ» работал так же, как «клиент».
 */

export type PatientTerms = {
  /** Именительный падеж мн.ч.: «Пациенты» или «Клиенты». */
  patientPluralLabel: string;
  /** Родительный падеж мн.ч.: «пациентов» или «клиентов». */
  patientGenPlural: string;
  /** Именительный падеж ед.ч.: «Пациент» или «Клиент». */
  patientSingularLabel: string;
};

export type DoctorClientTerms = PatientTerms & {
  /** Chosen display name for the one `doctor_patient_support.on_support` group. */
  supportGroupLabel: 'Избранные' | 'На сопровождении';
};

export const PATIENT_LABEL_VALUES = ['пациент', 'клиент'] as const;
export type PatientLabelValue = (typeof PATIENT_LABEL_VALUES)[number];

export const SUPPORT_GROUP_LABEL_KEY = 'support_group_label' as const;
export const SUPPORT_GROUP_LABEL_VALUES = ['favorites', 'on_support'] as const;
export type SupportGroupLabelValue = (typeof SUPPORT_GROUP_LABEL_VALUES)[number];

export function normalizePatientLabel(value: unknown): PatientLabelValue | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return (PATIENT_LABEL_VALUES as readonly string[]).includes(normalized)
    ? (normalized as PatientLabelValue)
    : null;
}

export function normalizeSupportGroupLabel(value: unknown): SupportGroupLabelValue | null {
  return typeof value === 'string' &&
    (SUPPORT_GROUP_LABEL_VALUES as readonly string[]).includes(value)
    ? (value as SupportGroupLabelValue)
    : null;
}

export function resolveSupportGroupLabel(value: unknown): 'Избранные' | 'На сопровождении' {
  return normalizeSupportGroupLabel(value) === 'favorites' ? 'Избранные' : 'На сопровождении';
}

/**
 * Резолвит {именительный мн.ч., родительный мн.ч., именительный ед.ч.} из значения настройки `patient_label`.
 *
 * @param singular — необработанное значение из БД (например «пациент», «клиент», «Клиент»).
 *                   Если не передано или `undefined/null`, используется дефолт «пациент».
 */
export function resolvePatientTerms(singular?: string | null): PatientTerms {
  const normalized = (singular ?? 'пациент').trim().toLowerCase();
  if (normalized === 'клиент') {
    return {
      patientPluralLabel: 'Клиенты',
      patientGenPlural: 'клиентов',
      patientSingularLabel: 'Клиент',
    };
  }
  return {
    patientPluralLabel: 'Пациенты',
    patientGenPlural: 'пациентов',
    patientSingularLabel: 'Пациент',
  };
}

/**
 * The sole terminology projection for specialist/client surfaces.  Both settings remain
 * organization-scoped, while the underlying membership stays the existing `onSupport` field.
 */
export function resolveDoctorClientTerms(
  patientLabel?: string | null,
  supportGroupLabel?: string | null,
): DoctorClientTerms {
  return {
    ...resolvePatientTerms(patientLabel),
    supportGroupLabel: resolveSupportGroupLabel(supportGroupLabel),
  };
}

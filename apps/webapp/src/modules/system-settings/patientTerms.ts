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
  /** Именительный падеж ед.ч. со строчной буквы: «пациент» или «клиент». */
  patientSingularLower: string;
  /** Родительный падеж ед.ч.: «пациента» или «клиента». */
  patientGenitive: string;
  /** Дательный падеж ед.ч.: «пациенту» или «клиенту». */
  patientDative: string;
  /** Дательный падеж мн.ч.: «пациентам» или «клиентам». */
  patientDativePlural: string;
  /** Творительный падеж ед.ч.: «пациентом» или «клиентом». */
  patientInstrumental: string;
  /** Творительный падеж мн.ч.: «пациентами» или «клиентами». */
  patientInstrumentalPlural: string;
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
 * @param value — необработанное значение либо стандартный `{ value }` envelope из БД.
 *                Если не передано или не распознано, используется дефолт «пациент».
 */
export function resolvePatientTerms(value?: unknown): PatientTerms {
  const singular =
    value !== null && typeof value === 'object' && 'value' in value
      ? (value as { value?: unknown }).value
      : value;
  const normalized = normalizePatientLabel(singular);
  if (normalized === 'клиент') {
    return {
      patientPluralLabel: 'Клиенты',
      patientGenPlural: 'клиентов',
      patientSingularLabel: 'Клиент',
      patientSingularLower: 'клиент',
      patientGenitive: 'клиента',
      patientDative: 'клиенту',
      patientDativePlural: 'клиентам',
      patientInstrumental: 'клиентом',
      patientInstrumentalPlural: 'клиентами',
    };
  }
  return {
    patientPluralLabel: 'Пациенты',
    patientGenPlural: 'пациентов',
    patientSingularLabel: 'Пациент',
    patientSingularLower: 'пациент',
    patientGenitive: 'пациента',
    patientDative: 'пациенту',
    patientDativePlural: 'пациентам',
    patientInstrumental: 'пациентом',
    patientInstrumentalPlural: 'пациентами',
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

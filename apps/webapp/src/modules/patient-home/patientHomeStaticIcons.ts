import type { PatientHomeBlockCode } from './ports';

/** Bundled PNG leading icons for patient home blocks (`public/patient/home/icons/`). */
export const PATIENT_HOME_BLOCK_STATIC_ICON_URL: Partial<Record<PatientHomeBlockCode, string>> = {
  booking: '/patient/home/icons/booking.png',
  sos: '/patient/home/icons/sos.png',
  progress: '/patient/home/icons/progress.png',
  next_reminder: '/patient/home/icons/next-reminder.png',
  plan: '/patient/home/icons/chart-line.png',
};

/** Bundled mood scale icons (`public/patient/home/icons/mood/`). */
export const PATIENT_HOME_MOOD_STATIC_ICON_URL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '/patient/home/icons/mood/1.png',
  2: '/patient/home/icons/mood/2.png',
  3: '/patient/home/icons/mood/3.png',
  4: '/patient/home/icons/mood/4.png',
  5: '/patient/home/icons/mood/5.png',
};

export type PatientHomeMoodOption = {
  score: 1 | 2 | 3 | 4 | 5;
  label: string;
  imageUrl: string;
};

const PATIENT_HOME_MOOD_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Очень плохо',
  2: 'Скорее плохо',
  3: 'Нейтрально',
  4: 'Хорошо',
  5: 'Отлично',
};

/**
 * Шкала самочувствия 1–5. Иконки — bundled-ассеты из `public/patient/home/icons/mood/`,
 * одинаковые для всех клиник; настройки клиники на них не влияют (решение владельца 18.08).
 */
export const PATIENT_HOME_MOOD_OPTIONS: readonly PatientHomeMoodOption[] = Object.freeze(
  ([1, 2, 3, 4, 5] as const).map((score) =>
    Object.freeze({
      score,
      label: PATIENT_HOME_MOOD_LABEL[score],
      imageUrl: PATIENT_HOME_MOOD_STATIC_ICON_URL[score],
    }),
  ),
);

export function resolvePatientHomeBlockLeadingIconUrl(
  code: PatientHomeBlockCode,
  cmsIconImageUrl: string | null | undefined,
): string | null {
  const staticUrl = PATIENT_HOME_BLOCK_STATIC_ICON_URL[code];
  if (staticUrl) return staticUrl;
  const cms = cmsIconImageUrl?.trim();
  return cms && cms.length > 0 ? cms : null;
}

/**
 * Канонический slug CMS-раздела «Разминки» (нижняя навигация, напоминания на странице раздела).
 * Не дублировать литерал `warmups` в UI — импортировать отсюда или {@link patientWarmupsSectionHref}.
 */
export const DEFAULT_WARMUPS_SECTION_SLUG = "warmups" as const;

/** Пациентский deep link на «Разминка дня» (не каталог CMS-раздела). */
export function patientWarmupsSectionHref(_slug: string = DEFAULT_WARMUPS_SECTION_SLUG): string {
  return "/app/patient/go/daily-warmup";
}

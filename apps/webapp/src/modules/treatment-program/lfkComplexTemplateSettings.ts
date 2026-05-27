/** Ключ в `settings` пункта программы после разворота комплекса ЛФК. */
export const TREATMENT_PROGRAM_LFK_COMPLEX_TEMPLATE_ID_SETTINGS_KEY = "lfkComplexTemplateId";

export function lfkComplexTemplateIdFromItemSettings(
  settings: Record<string, unknown> | null | undefined,
): string | null {
  const raw = settings?.[TREATMENT_PROGRAM_LFK_COMPLEX_TEMPLATE_ID_SETTINGS_KEY];
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

export function mergeLfkComplexTemplateIdIntoSettings(
  settings: Record<string, unknown> | null | undefined,
  complexTemplateId: string,
): Record<string, unknown> {
  return {
    ...(settings ?? {}),
    [TREATMENT_PROGRAM_LFK_COMPLEX_TEMPLATE_ID_SETTINGS_KEY]: complexTemplateId,
  };
}

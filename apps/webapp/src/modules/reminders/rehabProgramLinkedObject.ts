/** Sentinel для POST создания напоминания `rehab_program` до появления инстанса; сервер подставляет реальный UUID. */
export const PATIENT_REHAB_PROGRAM_LINKED_PLACEHOLDER = '__bersoncare_promo_rehab_program__';

export function isPatientRehabProgramPromoPlaceholder(
  linkedObjectId: string | null | undefined,
): boolean {
  return (linkedObjectId ?? '').trim() === PATIENT_REHAB_PROGRAM_LINKED_PLACEHOLDER;
}

/** Warmups remain independent when the rehabilitation workspace module is disabled. */
export function isRehabilitationReminderRule(rule: {
  category?: string | null;
  linkedObjectType?: string | null;
  reminderIntent?: string | null;
}): boolean {
  const intent = rule.reminderIntent?.trim().toLowerCase() ?? '';
  if (intent === 'warmup') return false;
  if (intent === 'exercises' || intent === 'stretch') return true;
  if (rule.category === 'lfk') return true;
  return (
    rule.linkedObjectType === 'rehab_program' ||
    rule.linkedObjectType === 'treatment_program_item' ||
    rule.linkedObjectType === 'lfk_complex'
  );
}

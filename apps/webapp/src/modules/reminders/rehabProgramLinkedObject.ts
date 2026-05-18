/** Sentinel для POST создания напоминания `rehab_program` до появления инстанса; сервер подставляет реальный UUID. */
export const PATIENT_REHAB_PROGRAM_LINKED_PLACEHOLDER = "__bersoncare_promo_rehab_program__";

export function isPatientRehabProgramPromoPlaceholder(linkedObjectId: string | null | undefined): boolean {
  return (linkedObjectId ?? "").trim() === PATIENT_REHAB_PROGRAM_LINKED_PLACEHOLDER;
}

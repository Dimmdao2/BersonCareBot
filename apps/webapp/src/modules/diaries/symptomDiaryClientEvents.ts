/** Событие документа: добавлена запись симптома (обновление графика на дневнике и т.п.). */
export const DIARY_SYMPTOM_ENTRY_SAVED_EVENT = "bersoncare:diary-symptom-entry-saved" as const;

export function notifyDiarySymptomEntrySaved(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DIARY_SYMPTOM_ENTRY_SAVED_EVENT));
}

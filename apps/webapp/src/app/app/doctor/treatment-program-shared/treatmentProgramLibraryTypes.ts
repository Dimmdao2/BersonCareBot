import type { InstanceEditorItemLoadSettingsPatch } from "./instanceEditorLoadSettings";

/** Строки каталогов для модалки «Элемент из библиотеки» (шаблон и экземпляр программы). */
export type TreatmentProgramLibraryExpandLine = {
  itemRefId: string;
  snapshot: Record<string, unknown>;
  loadSettings?: InstanceEditorItemLoadSettingsPatch;
};

export type TreatmentProgramLibraryRow = {
  id: string;
  title: string;
  subtitle?: string | null;
  thumbUrl?: string | null;
  /** Описание шаблона комплекса ЛФК из каталога (модалка развёртывания в упражнения). */
  description?: string | null;
  /** Коды `reference_items.code` (body_region) — клиентский фильтр в модалке экземпляра. */
  regionCodes?: readonly string[];
  /** Код `load_type` — клиентский фильтр в модалке экземпляра. */
  loadType?: string | null;
  /** Все типы нагрузки упражнений комплекса (фильтр «любое совпадение»). */
  loadTypes?: readonly string[];
  /** Строки для client-side draft expand (набор тестов / комплекс ЛФК). */
  expandLines?: TreatmentProgramLibraryExpandLine[];
};

export type TreatmentProgramLibraryPickers = {
  exercises: TreatmentProgramLibraryRow[];
  lfkComplexes: TreatmentProgramLibraryRow[];
  testSets: TreatmentProgramLibraryRow[];
  /** Клинические тесты каталога — добавление одной строкой этапа (`clinical_test`). */
  clinicalTests: TreatmentProgramLibraryRow[];
  recommendations: TreatmentProgramLibraryRow[];
  lessons: TreatmentProgramLibraryRow[];
};

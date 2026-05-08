/** Строки каталогов для модалки «Элемент из библиотеки» (шаблон и экземпляр программы). */
export type TreatmentProgramLibraryRow = {
  id: string;
  title: string;
  subtitle?: string | null;
  thumbUrl?: string | null;
  /** Описание шаблона комплекса ЛФК из каталога (модалка развёртывания в упражнения). */
  description?: string | null;
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

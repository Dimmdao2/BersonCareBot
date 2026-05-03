export type ClinicalTestMeasureKindRow = {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
};

export type ClinicalTestMeasureKindsPort = {
  listMeasureKinds(): Promise<ClinicalTestMeasureKindRow[]>;
  /**
   * Идемпотентно по `code`: если строка с таким `code` уже есть — возвращает её (`created: false`).
   */
  upsertMeasureKindByLabel(label: string): Promise<{ row: ClinicalTestMeasureKindRow; created: boolean }>;
};

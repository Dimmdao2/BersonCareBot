import type { ClinicalTestMeasureKindsPort, ClinicalTestMeasureKindRow } from "./measureKindsPorts";

export function createClinicalTestMeasureKindsService(port: ClinicalTestMeasureKindsPort) {
  return {
    async listMeasureKinds(): Promise<ClinicalTestMeasureKindRow[]> {
      return port.listMeasureKinds();
    },
    async createMeasureKindFromLabel(label: string): Promise<{ row: ClinicalTestMeasureKindRow; created: boolean }> {
      const t = label.trim();
      if (!t) throw new Error("Подпись вида измерения не может быть пустой");
      if (t.length > 500) throw new Error("Слишком длинная подпись");
      return port.upsertMeasureKindByLabel(t);
    },
  };
}

export type ClinicalTestMeasureKindsService = ReturnType<typeof createClinicalTestMeasureKindsService>;

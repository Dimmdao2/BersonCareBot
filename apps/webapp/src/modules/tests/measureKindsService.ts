import type {
  ClinicalTestMeasureKindsPort,
  ClinicalTestMeasureKindRow,
  MeasureKindOrderLabelUpdate,
} from "./measureKindsPorts";

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
    async saveMeasureKindsOrderAndLabels(
      updates: MeasureKindOrderLabelUpdate[],
    ): Promise<ClinicalTestMeasureKindRow[]> {
      const current = await port.listMeasureKinds();
      if (updates.length !== current.length) {
        throw new Error("Список устарел: обновите страницу и попробуйте снова");
      }
      const byId = new Map(current.map((r) => [r.id, r]));
      const incoming = new Set(updates.map((u) => u.id));
      for (const r of current) {
        if (!incoming.has(r.id)) {
          throw new Error("Список устарел: обновите страницу и попробуйте снова");
        }
      }
      for (const u of updates) {
        if (!byId.has(u.id)) {
          throw new Error("Неизвестный идентификатор вида измерения");
        }
        const t = u.label.trim();
        if (!t) throw new Error("Подпись вида измерения не может быть пустой");
        if (t.length > 500) throw new Error("Слишком длинная подпись");
      }
      return port.saveMeasureKindsOrderAndLabels(
        updates.map((u) => ({ id: u.id, label: u.label.trim(), sortOrder: u.sortOrder })),
      );
    },
  };
}

export type ClinicalTestMeasureKindsService = ReturnType<typeof createClinicalTestMeasureKindsService>;

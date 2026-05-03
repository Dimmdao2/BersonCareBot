import type { ClinicalTestMeasureKindsPort, ClinicalTestMeasureKindRow } from "@/modules/tests/measureKindsPorts";
import { measureKindLabelToCode } from "@/modules/tests/measureKindCode";

const store = new Map<string, ClinicalTestMeasureKindRow>();

export function resetInMemoryClinicalTestMeasureKindsStore(): void {
  store.clear();
}

export const inMemoryClinicalTestMeasureKindsPort: ClinicalTestMeasureKindsPort = {
  async listMeasureKinds(): Promise<ClinicalTestMeasureKindRow[]> {
    return [...store.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ru"));
  },

  async upsertMeasureKindByLabel(label: string): Promise<{ row: ClinicalTestMeasureKindRow; created: boolean }> {
    const code = measureKindLabelToCode(label);
    const hit = [...store.values()].find((r) => r.code === code);
    if (hit) return { row: hit, created: false };
    const row: ClinicalTestMeasureKindRow = {
      id: crypto.randomUUID(),
      code,
      label: label.trim(),
      sortOrder: 0,
    };
    store.set(row.id, row);
    return { row, created: true };
  },
};

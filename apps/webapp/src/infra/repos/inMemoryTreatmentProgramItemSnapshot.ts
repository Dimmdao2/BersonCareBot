import type { TreatmentProgramItemSnapshotPort } from "@/modules/treatment-program/ports";
import type { TreatmentProgramItemType } from "@/modules/treatment-program/types";

/** Vitest: минимальный снимок без обращения к БД. */
export function createInMemoryTreatmentProgramItemSnapshotPort(): TreatmentProgramItemSnapshotPort {
  return {
    async buildSnapshot(type: TreatmentProgramItemType, itemRefId: string) {
      return { itemType: type, id: itemRefId, stub: true };
    },
  };
}

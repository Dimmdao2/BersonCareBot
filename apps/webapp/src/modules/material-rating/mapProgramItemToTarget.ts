import type { TreatmentProgramItemType } from "@/modules/treatment-program/types";
import type { MaterialRatingTargetKind } from "./types";

export type ProgramItemRatingTarget =
  | { kind: MaterialRatingTargetKind; targetId: string }
  | { kind: null; targetId: null };

/**
 * Маппинг пункта программы реабилитации на цель оценки (см. план: `item_ref_id` без FK).
 * `lfk_complex` → id строки **шаблона комплекса** (`lfk_complex_templates`), как в {@link createPgTreatmentProgramItemRefValidationPort}.
 */
export function treatmentProgramItemToRatingTarget(
  itemType: TreatmentProgramItemType,
  itemRefId: string,
): ProgramItemRatingTarget {
  switch (itemType) {
    case "exercise":
      return { kind: "lfk_exercise", targetId: itemRefId };
    case "lesson":
      return { kind: "content_page", targetId: itemRefId };
    case "lfk_complex":
      return { kind: "lfk_complex", targetId: itemRefId };
    default:
      return { kind: null, targetId: null };
  }
}

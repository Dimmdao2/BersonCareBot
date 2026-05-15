export const MATERIAL_RATING_TARGET_KINDS = ["content_page", "lfk_exercise", "lfk_complex"] as const;

export type MaterialRatingTargetKind = (typeof MATERIAL_RATING_TARGET_KINDS)[number];

export type MaterialRatingAggregate = {
  avg: number | null;
  count: number;
  /** stars 1..5 -> count */
  distribution: Record<number, number>;
};

export type MaterialRatingDoctorSummaryRow = {
  targetKind: MaterialRatingTargetKind;
  targetId: string;
  avg: number | null;
  count: number;
  distribution: Record<number, number>;
};

/** Доступ к материалу для оценок (пациентский API). */
export class MaterialRatingAccessError extends Error {
  readonly accessCode: "not_found" | "forbidden";

  constructor(accessCode: "not_found" | "forbidden") {
    super(accessCode);
    this.accessCode = accessCode;
    this.name = "MaterialRatingAccessError";
  }
}

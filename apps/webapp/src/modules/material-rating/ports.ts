import type {
  MaterialRatingAggregate,
  MaterialRatingDoctorDetailDay,
  MaterialRatingDoctorDetailRater,
  MaterialRatingDoctorSummaryRow,
  MaterialRatingTargetKind,
} from "./types";

export type MaterialRatingPort = {
  upsertRating(input: {
    userId: string;
    targetKind: MaterialRatingTargetKind;
    targetId: string;
    stars: number;
  }): Promise<void>;

  getMyRating(input: {
    userId: string;
    targetKind: MaterialRatingTargetKind;
    targetId: string;
  }): Promise<number | null>;

  getAggregate(input: {
    targetKind: MaterialRatingTargetKind;
    targetId: string;
  }): Promise<MaterialRatingAggregate>;

  listDoctorSummary(input: {
    targetKind?: MaterialRatingTargetKind;
    limit: number;
    offset: number;
  }): Promise<MaterialRatingDoctorSummaryRow[]>;

  getDoctorDetail(input: {
    targetKind: MaterialRatingTargetKind;
    targetId: string;
    iana: string;
    startUtcIso: string;
    endExclusiveUtcIso: string;
    dayKeys: string[];
  }): Promise<{
    days: MaterialRatingDoctorDetailDay[];
    raters: MaterialRatingDoctorDetailRater[];
  }>;
};

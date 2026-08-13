import type {
  MaterialRatingAggregate,
  MaterialRatingDoctorDetailDay,
  MaterialRatingDoctorDetailRater,
  MaterialRatingDoctorSummaryRow,
  MaterialRatingTargetKind,
} from './types';

export type MaterialRatingPort = {
  upsertRating(input: {
    organizationId: string;
    userId: string;
    targetKind: MaterialRatingTargetKind;
    targetId: string;
    stars: number;
  }): Promise<void>;

  getMyRating(input: {
    organizationId: string;
    userId: string;
    targetKind: MaterialRatingTargetKind;
    targetId: string;
  }): Promise<number | null>;

  /** Patient-safe aggregate plus own value; never exposes another patient's rating row. */
  getPatientSnapshot(input: {
    organizationId: string;
    userId: string | null;
    targetKind: MaterialRatingTargetKind;
    targetId: string;
  }): Promise<{ aggregate: MaterialRatingAggregate; myStars: number | null }>;

  getAggregate(input: {
    organizationId: string;
    targetKind: MaterialRatingTargetKind;
    targetId: string;
    excludedUserIds?: string[];
  }): Promise<MaterialRatingAggregate>;

  /**
   * Батч-агрегаты для списков (карточки контента и т.п.): один запрос с
   * `target_id = ANY(...)` + GROUP BY, чтобы не плодить N+1 на каждую карточку.
   * Возвращает Map по `targetId`; цели без оценок в Map отсутствуют.
   */
  listAggregates(input: {
    organizationId: string;
    targetKind: MaterialRatingTargetKind;
    targetIds: string[];
    excludedUserIds?: string[];
  }): Promise<Map<string, MaterialRatingAggregate>>;

  listDoctorSummary(input: {
    organizationId: string;
    targetKind?: MaterialRatingTargetKind;
    limit: number;
    offset: number;
    excludedUserIds?: string[];
  }): Promise<MaterialRatingDoctorSummaryRow[]>;

  getDoctorDetail(input: {
    organizationId: string;
    targetKind: MaterialRatingTargetKind;
    targetId: string;
    iana: string;
    startUtcIso: string;
    endExclusiveUtcIso: string;
    dayKeys: string[];
    excludedUserIds?: string[];
  }): Promise<{
    days: MaterialRatingDoctorDetailDay[];
    raters: MaterialRatingDoctorDetailRater[];
  }>;
};

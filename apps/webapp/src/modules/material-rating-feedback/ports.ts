import type { MaterialRatingFeedbackReasonCode } from "./reasonCodes";

export type MaterialRatingFeedbackRow = {
  id: string;
  userId: string;
  contentPageId: string;
  ratingValue: number;
  reasonCodes: MaterialRatingFeedbackReasonCode[];
  comment: string | null;
  createdAt: string;
};

export type MaterialRatingFeedbackDoctorSummary = {
  total: number;
  byReasonCode: Record<MaterialRatingFeedbackReasonCode, number>;
  recent: Array<{
    id: string;
    userId: string;
    displayLabel: string;
    ratingValue: number;
    reasonCodes: MaterialRatingFeedbackReasonCode[];
    comment: string | null;
    createdAt: string;
  }>;
};

export type MaterialRatingFeedbackPort = {
  insertFeedback(input: {
    userId: string;
    contentPageId: string;
    ratingValue: number;
    reasonCodes: MaterialRatingFeedbackReasonCode[];
    comment: string | null;
  }): Promise<{ id: string }>;
  getDoctorSummary(contentPageId: string, recentLimit?: number): Promise<MaterialRatingFeedbackDoctorSummary>;
  listForPage(contentPageId: string, limit: number, offset: number): Promise<MaterialRatingFeedbackRow[]>;
  listDoctorFeedbackForPage(
    contentPageId: string,
    limit: number,
    offset: number,
  ): Promise<MaterialRatingFeedbackDoctorSummary["recent"]>;
};

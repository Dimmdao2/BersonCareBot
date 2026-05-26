import type { MaterialRatingFeedbackPort } from "./ports";
import type { MaterialRatingFeedbackReasonCode } from "./reasonCodes";
import { isMaterialRatingFeedbackReasonCode } from "./reasonCodes";

export function createMaterialRatingFeedbackService(deps: {
  feedback: MaterialRatingFeedbackPort;
  isDailyWarmupContentPage: (contentPageId: string) => Promise<boolean>;
}) {
  return {
    async submitPatientFeedback(input: {
      userId: string;
      contentPageId: string;
      ratingValue: number;
      reasonCodes: string[];
      comment: string | null;
    }): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
      if (input.ratingValue < 1 || input.ratingValue > 3) {
        return { ok: false, code: "rating_out_of_scope" };
      }

      const isWarmup = await deps.isDailyWarmupContentPage(input.contentPageId);
      if (!isWarmup) {
        return { ok: false, code: "not_daily_warmup" };
      }

      const reasonCodes = input.reasonCodes.filter(isMaterialRatingFeedbackReasonCode);
      const comment = input.comment?.trim() ?? "";
      if (reasonCodes.length === 0 && !comment) {
        return { ok: false, code: "empty_feedback" };
      }

      const row = await deps.feedback.insertFeedback({
        userId: input.userId,
        contentPageId: input.contentPageId,
        ratingValue: input.ratingValue,
        reasonCodes,
        comment: comment || null,
      });
      return { ok: true, id: row.id };
    },

    getDoctorSummary(contentPageId: string, recentLimit = 20) {
      return deps.feedback.getDoctorSummary(contentPageId, recentLimit);
    },

    listForPage(contentPageId: string, limit: number, offset: number) {
      return deps.feedback.listForPage(contentPageId, limit, offset);
    },

    listDoctorFeedbackForPage(contentPageId: string, limit: number, offset: number) {
      return deps.feedback.listDoctorFeedbackForPage(contentPageId, limit, offset);
    },
  };
}

export type MaterialRatingFeedbackService = ReturnType<typeof createMaterialRatingFeedbackService>;

export type { MaterialRatingFeedbackReasonCode };

import type { MaterialRatingFeedbackPort } from './ports';
import type { MaterialRatingFeedbackReasonCode } from './reasonCodes';
import { isMaterialRatingFeedbackReasonCode } from './reasonCodes';

export function createMaterialRatingFeedbackService(deps: {
  feedback: MaterialRatingFeedbackPort;
  isDailyWarmupContentPage: (input: {
    contentPageId: string;
    organizationId: string;
  }) => Promise<boolean>;
}) {
  return {
    async submitPatientFeedback(input: {
      organizationId: string;
      userId: string;
      contentPageId: string;
      ratingValue: number;
      reasonCodes: string[];
      comment: string | null;
    }): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
      if (input.ratingValue < 1 || input.ratingValue > 3) {
        return { ok: false, code: 'rating_out_of_scope' };
      }

      const isWarmup = await deps.isDailyWarmupContentPage({
        contentPageId: input.contentPageId,
        organizationId: input.organizationId,
      });
      if (!isWarmup) {
        return { ok: false, code: 'not_daily_warmup' };
      }

      const reasonCodes = input.reasonCodes.filter(isMaterialRatingFeedbackReasonCode);
      const comment = input.comment?.trim() ?? '';
      if (reasonCodes.length === 0 && !comment) {
        return { ok: false, code: 'empty_feedback' };
      }

      const row = await deps.feedback.insertFeedback({
        organizationId: input.organizationId,
        userId: input.userId,
        contentPageId: input.contentPageId,
        ratingValue: input.ratingValue,
        reasonCodes,
        comment: comment || null,
      });
      return { ok: true, id: row.id };
    },

    getDoctorSummary(input: {
      organizationId: string;
      contentPageId: string;
      recentLimit?: number;
    }) {
      return deps.feedback.getDoctorSummary(input);
    },

    listForPage(input: {
      organizationId: string;
      contentPageId: string;
      limit: number;
      offset: number;
    }) {
      return deps.feedback.listForPage(input);
    },

    listDoctorFeedbackForPage(input: {
      organizationId: string;
      contentPageId: string;
      limit: number;
      offset: number;
    }) {
      return deps.feedback.listDoctorFeedbackForPage(input);
    },
  };
}

export type MaterialRatingFeedbackService = ReturnType<typeof createMaterialRatingFeedbackService>;

export type { MaterialRatingFeedbackReasonCode };

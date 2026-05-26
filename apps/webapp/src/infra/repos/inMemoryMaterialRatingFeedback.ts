import { randomUUID } from "node:crypto";
import type { MaterialRatingFeedbackPort } from "@/modules/material-rating-feedback/ports";
import type { MaterialRatingFeedbackRow } from "@/modules/material-rating-feedback/ports";
import {
  MATERIAL_RATING_FEEDBACK_REASON_CODES,
  type MaterialRatingFeedbackReasonCode,
} from "@/modules/material-rating-feedback/reasonCodes";

const rows: MaterialRatingFeedbackRow[] = [];

export function resetInMemoryMaterialRatingFeedbackForTests() {
  rows.length = 0;
}

function emptyReasonCounts(): Record<MaterialRatingFeedbackReasonCode, number> {
  return MATERIAL_RATING_FEEDBACK_REASON_CODES.reduce(
    (acc, code) => {
      acc[code] = 0;
      return acc;
    },
    {} as Record<MaterialRatingFeedbackReasonCode, number>,
  );
}

export function createInMemoryMaterialRatingFeedbackPort(): MaterialRatingFeedbackPort {
  return {
    async insertFeedback(input) {
      const id = randomUUID();
      rows.push({
        id,
        userId: input.userId,
        contentPageId: input.contentPageId,
        ratingValue: input.ratingValue,
        reasonCodes: input.reasonCodes,
        comment: input.comment,
        createdAt: new Date().toISOString(),
      });
      return { id };
    },

    async getDoctorSummary(contentPageId, recentLimit = 20) {
      const all = rows
        .filter((r) => r.contentPageId === contentPageId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const byReasonCode = emptyReasonCounts();
      for (const row of all) {
        for (const code of row.reasonCodes) {
          byReasonCode[code] += 1;
        }
      }
      return {
        total: all.length,
        byReasonCode,
        recent: all.slice(0, recentLimit).map((row) => ({
          id: row.id,
          userId: row.userId,
          displayLabel: row.userId,
          ratingValue: row.ratingValue,
          reasonCodes: row.reasonCodes,
          comment: row.comment,
          createdAt: row.createdAt,
        })),
      };
    },

    async listForPage(contentPageId, limit, offset) {
      return rows
        .filter((r) => r.contentPageId === contentPageId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(offset, offset + limit);
    },

    async listDoctorFeedbackForPage(contentPageId, limit, offset) {
      return rows
        .filter((r) => r.contentPageId === contentPageId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(offset, offset + limit)
        .map((row) => ({
          id: row.id,
          userId: row.userId,
          displayLabel: row.userId,
          ratingValue: row.ratingValue,
          reasonCodes: row.reasonCodes,
          comment: row.comment,
          createdAt: row.createdAt,
        }));
    },
  };
}

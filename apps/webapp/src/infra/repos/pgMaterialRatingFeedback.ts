import { desc, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { patientContentRatingFeedback } from "../../../db/schema/patientContentRatingFeedback";
import { platformUsers } from "../../../db/schema/schema";
import type { MaterialRatingFeedbackPort } from "@/modules/material-rating-feedback/ports";
import {
  MATERIAL_RATING_FEEDBACK_REASON_CODES,
  type MaterialRatingFeedbackReasonCode,
} from "@/modules/material-rating-feedback/reasonCodes";

function emptyReasonCounts(): Record<MaterialRatingFeedbackReasonCode, number> {
  return MATERIAL_RATING_FEEDBACK_REASON_CODES.reduce(
    (acc, code) => {
      acc[code] = 0;
      return acc;
    },
    {} as Record<MaterialRatingFeedbackReasonCode, number>,
  );
}

export function createPgMaterialRatingFeedbackPort(): MaterialRatingFeedbackPort {
  return {
    async insertFeedback(input) {
      const db = getDrizzle();
      const [row] = await db
        .insert(patientContentRatingFeedback)
        .values({
          userId: input.userId,
          contentPageId: input.contentPageId,
          ratingValue: input.ratingValue,
          reasonCodes: input.reasonCodes,
          comment: input.comment,
        })
        .returning({ id: patientContentRatingFeedback.id });
      if (!row) throw new Error("patient_content_rating_feedback insert returned no row");
      return { id: row.id };
    },

    async getDoctorSummary(contentPageId, recentLimit = 20) {
      const db = getDrizzle();
      const aggRows = await db
        .select({ reasonCodes: patientContentRatingFeedback.reasonCodes })
        .from(patientContentRatingFeedback)
        .where(eq(patientContentRatingFeedback.contentPageId, contentPageId));

      const byReasonCode = emptyReasonCounts();
      for (const row of aggRows) {
        for (const code of row.reasonCodes ?? []) {
          if (code in byReasonCode) {
            byReasonCode[code as MaterialRatingFeedbackReasonCode] += 1;
          }
        }
      }

      const recentRows = await db
        .select({
          id: patientContentRatingFeedback.id,
          userId: patientContentRatingFeedback.userId,
          ratingValue: patientContentRatingFeedback.ratingValue,
          reasonCodes: patientContentRatingFeedback.reasonCodes,
          comment: patientContentRatingFeedback.comment,
          createdAt: patientContentRatingFeedback.createdAt,
          displayName: platformUsers.displayName,
          phoneNormalized: platformUsers.phoneNormalized,
        })
        .from(patientContentRatingFeedback)
        .leftJoin(platformUsers, eq(platformUsers.id, patientContentRatingFeedback.userId))
        .where(eq(patientContentRatingFeedback.contentPageId, contentPageId))
        .orderBy(desc(patientContentRatingFeedback.createdAt))
        .limit(recentLimit);

      return {
        total: aggRows.length,
        byReasonCode,
        recent: recentRows.map((row) => ({
          id: row.id,
          userId: row.userId,
          displayLabel:
            row.displayName?.trim() ||
            row.phoneNormalized?.trim() ||
            row.userId,
          ratingValue: row.ratingValue,
          reasonCodes: (row.reasonCodes ?? []) as MaterialRatingFeedbackReasonCode[],
          comment: row.comment,
          createdAt: row.createdAt,
        })),
      };
    },

    async listForPage(contentPageId, limit, offset) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(patientContentRatingFeedback)
        .where(eq(patientContentRatingFeedback.contentPageId, contentPageId))
        .orderBy(desc(patientContentRatingFeedback.createdAt))
        .limit(limit)
        .offset(offset);
      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        contentPageId: row.contentPageId,
        ratingValue: row.ratingValue,
        reasonCodes: row.reasonCodes as MaterialRatingFeedbackReasonCode[],
        comment: row.comment,
        createdAt: row.createdAt,
      }));
    },

    async listDoctorFeedbackForPage(contentPageId, limit, offset) {
      const db = getDrizzle();
      const rows = await db
        .select({
          id: patientContentRatingFeedback.id,
          userId: patientContentRatingFeedback.userId,
          ratingValue: patientContentRatingFeedback.ratingValue,
          reasonCodes: patientContentRatingFeedback.reasonCodes,
          comment: patientContentRatingFeedback.comment,
          createdAt: patientContentRatingFeedback.createdAt,
          displayName: platformUsers.displayName,
          phoneNormalized: platformUsers.phoneNormalized,
        })
        .from(patientContentRatingFeedback)
        .leftJoin(platformUsers, eq(platformUsers.id, patientContentRatingFeedback.userId))
        .where(eq(patientContentRatingFeedback.contentPageId, contentPageId))
        .orderBy(desc(patientContentRatingFeedback.createdAt))
        .limit(limit)
        .offset(offset);
      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        displayLabel:
          row.displayName?.trim() ||
          row.phoneNormalized?.trim() ||
          row.userId,
        ratingValue: row.ratingValue,
        reasonCodes: (row.reasonCodes ?? []) as MaterialRatingFeedbackReasonCode[],
        comment: row.comment,
        createdAt: row.createdAt,
      }));
    },
  };
}

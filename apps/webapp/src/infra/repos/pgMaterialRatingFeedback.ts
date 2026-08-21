import { and, desc, eq, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { patientContentRatingFeedback } from '../../../db/schema/patientContentRatingFeedback';
import { platformUsers, userIdentity } from '../../../db/schema/schema';
import { drizzleFioCols, drizzleUserIdentityFioJoin } from '@/infra/repos/userIdentityFioSql';
import { drizzlePrimaryPhoneCol } from '@/infra/repos/userContactsSql';
import type { MaterialRatingFeedbackPort } from '@/modules/material-rating-feedback/ports';
import {
  MATERIAL_RATING_FEEDBACK_REASON_CODES,
  type MaterialRatingFeedbackReasonCode,
} from '@/modules/material-rating-feedback/reasonCodes';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

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
      const result = await runWebappNamedRoot<{ id: string | null }>(
        getWebappSqlDb(),
        'app.record_current_patient_content_rating_feedback(uuid,integer,text,text)',
        [input.contentPageId, input.ratingValue, JSON.stringify(input.reasonCodes), input.comment],
        sql`SELECT app.record_current_patient_content_rating_feedback(
          ${input.contentPageId}::uuid,
          ${input.ratingValue}::integer,
          ${JSON.stringify(input.reasonCodes)}::text,
          ${input.comment}::text
        ) AS id`,
      );
      const row = result.rows[0];
      if (!row) throw new Error('patient_content_rating_feedback insert returned no row');
      if (!row.id) throw new Error('patient_content_rating_feedback rejected');
      void input.organizationId;
      void input.userId;
      return { id: row.id };
    },

    async getDoctorSummary({ organizationId, contentPageId, recentLimit = 20 }) {
      const db = getDrizzle();
      const aggRows = await db
        .select({ reasonCodes: patientContentRatingFeedback.reasonCodes })
        .from(patientContentRatingFeedback)
        .where(
          and(
            eq(patientContentRatingFeedback.organizationId, organizationId),
            eq(patientContentRatingFeedback.contentPageId, contentPageId),
          ),
        );

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
          displayName: drizzleFioCols.displayName,
          phoneNormalized: drizzlePrimaryPhoneCol,
        })
        .from(patientContentRatingFeedback)
        .leftJoin(platformUsers, eq(platformUsers.id, patientContentRatingFeedback.userId))
        .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
        .where(
          and(
            eq(patientContentRatingFeedback.organizationId, organizationId),
            eq(patientContentRatingFeedback.contentPageId, contentPageId),
          ),
        )
        .orderBy(desc(patientContentRatingFeedback.createdAt))
        .limit(recentLimit);

      return {
        total: aggRows.length,
        byReasonCode,
        recent: recentRows.map((row) => ({
          id: row.id,
          userId: row.userId,
          displayLabel: row.displayName?.trim() || row.phoneNormalized?.trim() || row.userId,
          ratingValue: row.ratingValue,
          reasonCodes: (row.reasonCodes ?? []) as MaterialRatingFeedbackReasonCode[],
          comment: row.comment,
          createdAt: row.createdAt,
        })),
      };
    },

    async listForPage({ organizationId, contentPageId, limit, offset }) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(patientContentRatingFeedback)
        .where(
          and(
            eq(patientContentRatingFeedback.organizationId, organizationId),
            eq(patientContentRatingFeedback.contentPageId, contentPageId),
          ),
        )
        .orderBy(desc(patientContentRatingFeedback.createdAt))
        .limit(limit)
        .offset(offset);
      return rows.map((row) => ({
        id: row.id,
        organizationId,
        userId: row.userId,
        contentPageId: row.contentPageId,
        ratingValue: row.ratingValue,
        reasonCodes: row.reasonCodes as MaterialRatingFeedbackReasonCode[],
        comment: row.comment,
        createdAt: row.createdAt,
      }));
    },

    async listDoctorFeedbackForPage({ organizationId, contentPageId, limit, offset }) {
      const db = getDrizzle();
      const rows = await db
        .select({
          id: patientContentRatingFeedback.id,
          userId: patientContentRatingFeedback.userId,
          ratingValue: patientContentRatingFeedback.ratingValue,
          reasonCodes: patientContentRatingFeedback.reasonCodes,
          comment: patientContentRatingFeedback.comment,
          createdAt: patientContentRatingFeedback.createdAt,
          displayName: drizzleFioCols.displayName,
          phoneNormalized: drizzlePrimaryPhoneCol,
        })
        .from(patientContentRatingFeedback)
        .leftJoin(platformUsers, eq(platformUsers.id, patientContentRatingFeedback.userId))
        .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
        .where(
          and(
            eq(patientContentRatingFeedback.organizationId, organizationId),
            eq(patientContentRatingFeedback.contentPageId, contentPageId),
          ),
        )
        .orderBy(desc(patientContentRatingFeedback.createdAt))
        .limit(limit)
        .offset(offset);
      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        displayLabel: row.displayName?.trim() || row.phoneNormalized?.trim() || row.userId,
        ratingValue: row.ratingValue,
        reasonCodes: (row.reasonCodes ?? []) as MaterialRatingFeedbackReasonCode[],
        comment: row.comment,
        createdAt: row.createdAt,
      }));
    },
  };
}

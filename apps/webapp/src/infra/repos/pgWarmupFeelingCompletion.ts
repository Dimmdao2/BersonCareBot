import { and, eq, isNull } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { patientPracticeCompletions, symptomEntries } from "../../../db/schema";
import type { SymptomDiaryPort } from "@/modules/diaries/ports";
import type { PatientPracticePort } from "@/modules/patient-practice/ports";
import type {
  ApplyDailyWarmupFeelingParams,
  WarmupFeelingCompletionPort,
} from "@/modules/patient-practice/warmupFeelingCompletionPort";

function pgErrCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e && typeof (e as { code?: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  if (typeof e === "object" && e !== null && "cause" in e) {
    return pgErrCode((e as { cause?: unknown }).cause);
  }
  return undefined;
}

export function createPgWarmupFeelingCompletionPort(opts: {
  diaries: Pick<SymptomDiaryPort, "upsertWarmupFeelingTrackingIdInTx">;
  completions: Pick<PatientPracticePort, "getByIdForUser" | "updateFeelingById">;
}): WarmupFeelingCompletionPort {
  return {
    async applyDailyWarmupFeeling(params: ApplyDailyWarmupFeelingParams): Promise<{ duplicate: boolean }> {
      const {
        userId,
        completionId,
        feeling,
        completedAtIso,
        symptomTypeRefId,
        symptomTitle,
      } = params;

      const db = getDrizzle();
      let duplicate = false;

      try {
        await db.transaction(async (tx) => {
          const trackingId = await opts.diaries.upsertWarmupFeelingTrackingIdInTx(tx, {
            userId,
            symptomTitle,
            symptomTypeRefId,
          });

          const existing = await tx
            .select({ id: symptomEntries.id })
            .from(symptomEntries)
            .where(eq(symptomEntries.patientPracticeCompletionId, completionId))
            .limit(1);
          if (existing.length > 0) {
            await tx
              .update(patientPracticeCompletions)
              .set({ feeling })
              .where(
                and(
                  eq(patientPracticeCompletions.id, completionId),
                  eq(patientPracticeCompletions.userId, userId),
                  isNull(patientPracticeCompletions.feeling),
                ),
              );
            duplicate = true;
            return;
          }

          await tx.insert(symptomEntries).values({
            userId,
            platformUserId: userId,
            trackingId,
            value010: feeling,
            entryType: "instant",
            recordedAt: completedAtIso,
            source: "webapp",
            notes: null,
            patientPracticeCompletionId: completionId,
          });

          await tx
            .update(patientPracticeCompletions)
            .set({ feeling })
            .where(
              and(eq(patientPracticeCompletions.id, completionId), eq(patientPracticeCompletions.userId, userId)),
            );
        });
      } catch (e: unknown) {
        const code = pgErrCode(e);
        if (code === "23505") {
          duplicate = true;
        } else {
          throw e;
        }
      }

      if (duplicate) {
        const again = await opts.completions.getByIdForUser(completionId, userId);
        if (again && again.feeling === null) {
          await opts.completions.updateFeelingById(completionId, userId, feeling);
        }
      }

      return { duplicate };
    },
  };
}

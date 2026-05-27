import { eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { patientDailyWarmupPresentations } from "../../../db/schema";
import type { PatientDailyWarmupPresentationPort } from "@/modules/patient-home/dailyWarmupPresentationPorts";

export function createPgPatientDailyWarmupPresentationPort(): PatientDailyWarmupPresentationPort {
  return {
    async getPresentedContentPageId(userId) {
      const db = getDrizzle();
      const rows = await db
        .select({ contentPageId: patientDailyWarmupPresentations.contentPageId })
        .from(patientDailyWarmupPresentations)
        .where(eq(patientDailyWarmupPresentations.userId, userId))
        .limit(1);
      return rows[0]?.contentPageId ?? null;
    },

    async setPresentedContentPageId(userId, contentPageId) {
      const db = getDrizzle();
      await db
        .insert(patientDailyWarmupPresentations)
        .values({ userId, contentPageId })
        .onConflictDoUpdate({
          target: patientDailyWarmupPresentations.userId,
          set: { contentPageId, updatedAt: new Date().toISOString() },
        });
    },
  };
}

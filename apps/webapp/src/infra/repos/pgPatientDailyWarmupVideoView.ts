import { getDrizzle } from "@/app-layer/db/drizzle";
import { patientDailyWarmupVideoViews } from "../../../db/schema";
import type { PatientDailyWarmupVideoViewPort } from "@/modules/patient-home/dailyWarmupVideoViewPorts";

export function createPgPatientDailyWarmupVideoViewPort(): PatientDailyWarmupVideoViewPort {
  return {
    async recordView(userId, contentPageId) {
      const db = getDrizzle();
      await db.insert(patientDailyWarmupVideoViews).values({ userId, contentPageId });
    },
  };
}

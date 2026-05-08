/**
 * Upsert трекинга `warmup_feeling` внутри Drizzle-транзакции (тот же SQL, что {@link pgSymptomDiary.ensureWarmupFeelingTracking},
 * но на переданном `tx`, чтобы симптом + completion были атомарны с записью симптома).
 */
import { sql } from "drizzle-orm";

/** Минимальный контракт сессии транзакции Drizzle (node-postgres). */
export type DrizzleTxExecute = {
  execute: (query: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }>;
};

export async function upsertWarmupFeelingTrackingIdInTx(
  tx: DrizzleTxExecute,
  params: { userId: string; symptomTitle: string; symptomTypeRefId: string },
): Promise<string> {
  const nowIso = new Date().toISOString();
  const res = await tx.execute(sql`
    INSERT INTO symptom_trackings (
      user_id, platform_user_id, symptom_key, symptom_title, is_active, updated_at,
      symptom_type_ref_id, region_ref_id, side, diagnosis_text, diagnosis_ref_id, stage_ref_id
    )
    VALUES (
      ${params.userId}::text,
      ${params.userId}::uuid,
      'warmup_feeling',
      ${params.symptomTitle},
      true,
      ${nowIso}::timestamptz,
      ${params.symptomTypeRefId}::uuid,
      NULL, NULL, NULL, NULL, NULL
    )
    ON CONFLICT (platform_user_id) WHERE (
      symptom_key = 'warmup_feeling'
      AND deleted_at IS NULL
      AND platform_user_id IS NOT NULL
    )
    DO UPDATE SET updated_at = symptom_trackings.updated_at
    RETURNING id
  `);
  const rows = res.rows as { id: string }[];
  const id = rows[0]?.id;
  if (!id) throw new Error("warmup_feeling_tracking_upsert_failed");
  return id;
}

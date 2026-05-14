import { getDrizzle } from "@/app-layer/db/drizzle";
import { operatorJobStatus } from "../../../db/schema/operatorHealth";
import {
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
} from "@/modules/operator-health/reconcileJobKeys";
import type { OperatorHealthWritePort } from "@/modules/operator-health/ports";

const MAX_JOB_ERROR_CHARS = 2_048;

function clampErrorMessage(message: string): string {
  if (message.length <= MAX_JOB_ERROR_CHARS) return message;
  return `${message.slice(0, MAX_JOB_ERROR_CHARS)}…`;
}

export const pgOperatorHealthWritePort: OperatorHealthWritePort = {
  async recordMediaTranscodeReconcileSuccess(input) {
    const db = getDrizzle();
    const finishedIso = new Date().toISOString();
    await db
      .insert(operatorJobStatus)
      .values({
        jobKey: OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
        jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
        lastStatus: "success",
        lastStartedAt: input.startedAtIso,
        lastFinishedAt: finishedIso,
        lastSuccessAt: finishedIso,
        lastFailureAt: null,
        lastDurationMs: input.durationMs,
        lastError: null,
        metaJson: input.metaJson,
      })
      .onConflictDoUpdate({
        target: operatorJobStatus.jobKey,
        set: {
          jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
          lastStatus: "success",
          lastStartedAt: input.startedAtIso,
          lastFinishedAt: finishedIso,
          lastSuccessAt: finishedIso,
          lastFailureAt: null,
          lastDurationMs: input.durationMs,
          lastError: null,
          metaJson: input.metaJson,
        },
      });
  },

  async recordMediaTranscodeReconcileFailure(input) {
    const db = getDrizzle();
    const finishedIso = new Date().toISOString();
    const err = clampErrorMessage(input.error);
    await db
      .insert(operatorJobStatus)
      .values({
        jobKey: OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
        jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
        lastStatus: "failure",
        lastStartedAt: input.startedAtIso,
        lastFinishedAt: finishedIso,
        lastSuccessAt: null,
        lastFailureAt: finishedIso,
        lastDurationMs: input.durationMs,
        lastError: err,
        metaJson: {},
      })
      .onConflictDoUpdate({
        target: operatorJobStatus.jobKey,
        set: {
          jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
          lastStatus: "failure",
          lastStartedAt: input.startedAtIso,
          lastFinishedAt: finishedIso,
          lastFailureAt: finishedIso,
          lastDurationMs: input.durationMs,
          lastError: err,
          // Сброс: после прошлого success иначе в UI висит успешный meta_json при lastStatus=failure.
          metaJson: {},
        },
      });
  },
};

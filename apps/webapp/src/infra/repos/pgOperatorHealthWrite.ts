import { isNull } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { operatorIncidents, operatorJobStatus } from "../../../db/schema/operatorHealth";
import {
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
  OPERATOR_REMINDERS_JOB_FAMILY,
  OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY,
} from "@/modules/operator-health/reconcileJobKeys";
import type { OperatorHealthWritePort } from "@/modules/operator-health/ports";

const MAX_JOB_ERROR_CHARS = 2_048;

function clampErrorMessage(message: string): string {
  if (message.length <= MAX_JOB_ERROR_CHARS) return message;
  return `${message.slice(0, MAX_JOB_ERROR_CHARS)}…`;
}

async function upsertOperatorJobSuccess(input: {
  jobFamily: string;
  jobKey: string;
  startedAtIso: string;
  durationMs: number;
  metaJson: Record<string, unknown>;
}): Promise<void> {
  const db = getDrizzle();
  const finishedIso = new Date().toISOString();
  await db
    .insert(operatorJobStatus)
    .values({
      jobKey: input.jobKey,
      jobFamily: input.jobFamily,
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
        jobFamily: input.jobFamily,
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
}

async function upsertOperatorJobFailure(input: {
  jobFamily: string;
  jobKey: string;
  startedAtIso: string;
  durationMs: number;
  error: string;
  metaJson: Record<string, unknown>;
  clearMetaOnFailure: boolean;
}): Promise<void> {
  const db = getDrizzle();
  const finishedIso = new Date().toISOString();
  const err = clampErrorMessage(input.error);
  const metaJson = input.clearMetaOnFailure ? {} : input.metaJson;
  await db
    .insert(operatorJobStatus)
    .values({
      jobKey: input.jobKey,
      jobFamily: input.jobFamily,
      lastStatus: "failure",
      lastStartedAt: input.startedAtIso,
      lastFinishedAt: finishedIso,
      lastSuccessAt: null,
      lastFailureAt: finishedIso,
      lastDurationMs: input.durationMs,
      lastError: err,
      metaJson,
    })
    .onConflictDoUpdate({
      target: operatorJobStatus.jobKey,
      set: {
        jobFamily: input.jobFamily,
        lastStatus: "failure",
        lastStartedAt: input.startedAtIso,
        lastFinishedAt: finishedIso,
        lastFailureAt: finishedIso,
        lastDurationMs: input.durationMs,
        lastError: err,
        metaJson,
      },
    });
}

export const pgOperatorHealthWritePort: OperatorHealthWritePort = {
  async recordOperatorJobTickSuccess(input) {
    await upsertOperatorJobSuccess(input);
  },

  async recordOperatorJobTickFailure(input) {
    await upsertOperatorJobFailure({
      ...input,
      clearMetaOnFailure: false,
    });
  },

  async recordMediaTranscodeReconcileSuccess(input) {
    await upsertOperatorJobSuccess({
      jobKey: OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      metaJson: input.metaJson,
    });
  },

  async recordMediaTranscodeReconcileFailure(input) {
    await upsertOperatorJobFailure({
      jobKey: OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      error: input.error,
      metaJson: {},
      clearMetaOnFailure: true,
    });
  },

  async recordWebPushOnlyReminderTickSuccess(input) {
    await upsertOperatorJobSuccess({
      jobKey: OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY,
      jobFamily: OPERATOR_REMINDERS_JOB_FAMILY,
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      metaJson: input.metaJson,
    });
  },

  async recordWebPushOnlyReminderTickFailure(input) {
    await upsertOperatorJobFailure({
      jobKey: OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY,
      jobFamily: OPERATOR_REMINDERS_JOB_FAMILY,
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      error: input.error,
      metaJson: input.metaJson,
      clearMetaOnFailure: false,
    });
  },

  async resolveAllOpenIncidents() {
    const db = getDrizzle();
    const finishedIso = new Date().toISOString();
    const rows = await db
      .update(operatorIncidents)
      .set({ resolvedAt: finishedIso })
      .where(isNull(operatorIncidents.resolvedAt))
      .returning({ id: operatorIncidents.id });
    return { resolved: rows.length };
  },
};

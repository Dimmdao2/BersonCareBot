import { z } from "zod";
import { getSaasIsolationOperatorPool } from "@/infra/db/saasIsolationTelemetry";

const nonNegativeNumber = z.number().finite().nonnegative();
const nullableIso = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), "invalid timestamp")
  .nullable();

const safeMetaSchema = z
  .object({
    failed: nonNegativeNumber.optional(),
    consecutiveCronFailures: nonNegativeNumber.optional(),
    consecutiveFailRuns: nonNegativeNumber.optional(),
    rubitime: z.enum(["ok", "fail", "skipped_not_configured", "no_data"]).optional(),
    telegram: z.enum(["ok", "fail", "skipped_not_configured", "no_data"]).optional(),
    max: z.enum(["ok", "fail", "skipped_not_configured", "no_data"]).optional(),
    google_calendar: z.enum(["ok", "fail", "skipped_not_configured", "no_data"]).optional(),
  })
  .strict();

const operatorJobSchema = z
  .object({
    jobKey: z.string().min(1).max(80),
    jobFamily: z.string().min(1).max(40),
    lastStatus: z.string().min(1).max(40),
    lastFinishedAt: nullableIso,
    lastSuccessAt: nullableIso,
    lastFailureAt: nullableIso,
    lastDurationMs: nonNegativeNumber.nullable(),
    safeMeta: safeMetaSchema,
  })
  .strict();

const queueSchema = z
  .object({
    dueBacklog: nonNegativeNumber,
    deadTotal: nonNegativeNumber,
    blockedRecipientTotal: nonNegativeNumber.optional(),
    oldestDueAgeSeconds: nonNegativeNumber.nullable(),
    dueByChannel: z.record(z.string(), nonNegativeNumber).optional(),
    dueByKind: z.record(z.string(), nonNegativeNumber),
    deadByKind: z.record(z.string(), nonNegativeNumber),
    processingCount: nonNegativeNumber,
    reminderProcessingCount: nonNegativeNumber.optional(),
    oldestProcessingAgeSeconds: nonNegativeNumber.nullable().optional(),
    lastSentAt: nullableIso.optional(),
    lastQueueActivityAt: nullableIso,
  })
  .strict();

const notificationChannelSchema = z
  .object({
    successCount: nonNegativeNumber,
    failedCount: nonNegativeNumber,
    skippedCount: nonNegativeNumber,
    lastAttemptAt: nullableIso,
    lastSuccessAt: nullableIso,
    lastErrorAt: nullableIso,
    lastErrorReason: z.null(),
    lastErrorMessage: z.null(),
  })
  .strict();

export const curatedSystemHealthSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    config: z
      .object({
        pipelineEnabled: z.boolean(),
        reconcileEnabled: z.boolean(),
        playbackEnabled: z.boolean(),
        vapidConfigured: z.boolean(),
        smtpConfigured: z.boolean(),
      })
      .strict(),
    videoTranscode: z
      .object({
        pendingCount: nonNegativeNumber,
        processingCount: nonNegativeNumber,
        doneLastHour: nonNegativeNumber,
        failedLastHour: nonNegativeNumber,
        doneLast24h: nonNegativeNumber,
        failedLast24h: nonNegativeNumber,
        doneLifetime: nonNegativeNumber,
        failedLifetime: nonNegativeNumber,
        avgProcessingMsDoneLastHour: nonNegativeNumber.nullable(),
        oldestPendingAgeSeconds: nonNegativeNumber.nullable(),
        legacyReconcileCandidateCountWithinSizeCap: nonNegativeNumber,
        readableVideoReadyWithHlsCount: nonNegativeNumber,
      })
      .strict(),
    operatorJobs: z.array(operatorJobSchema).max(32),
    operatorIncidents: z
      .object({
        openCount: nonNegativeNumber,
        occurrenceCount: nonNegativeNumber,
        lastSeenAt: nullableIso,
      })
      .strict(),
    outgoingDelivery: queueSchema,
    integratorPushOutbox: queueSchema,
    remindersPipeline: z
      .object({
        windowHours: z.literal(24),
        outgoingReminderDispatch: z
          .object({ due: nonNegativeNumber, dead: nonNegativeNumber, processing: nonNegativeNumber })
          .strict(),
        occurrenceHistory: z.object({ sent: nonNegativeNumber, failed: nonNegativeNumber }).strict(),
        deliveryEvents: z.object({ sent: nonNegativeNumber, failed: nonNegativeNumber }).strict(),
        patientReminderM2mIdempotencyKeysActive: nonNegativeNumber,
      })
      .strict(),
    webPush: z
      .object({
        windowHours: z.literal(24),
        activeSubscriptionsCount: nonNegativeNumber,
        usersWithSubscriptionCount: nonNegativeNumber,
        subscriptionsTouchedLast24h: nonNegativeNumber,
      })
      .strict(),
    notificationDelivery: z
      .object({
        windowHours: z.literal(24),
        totalAttempts24h: nonNegativeNumber,
        byChannel: z
          .object({
            telegram: notificationChannelSchema,
            max: notificationChannelSchema,
            web_push: notificationChannelSchema,
            email: notificationChannelSchema,
          })
          .strict(),
        recentIssues: z.tuple([]),
      })
      .strict(),
    integrationWebhookStatus: z
      .array(
        z
          .object({
            source: z.enum(["rubitime", "telegram", "max"]),
            receivedAt: nullableIso.unwrap(),
            processedOk: z.boolean(),
            httpStatusReturned: z.number().int().min(100).max(599).nullable(),
          })
          .strict(),
      )
      .max(3),
    operatorHealthDigestLastSentAt: nullableIso,
  })
  .strict();

export type CuratedSystemHealthSnapshot = z.infer<typeof curatedSystemHealthSnapshotSchema>;

/** Uses the already-protected diagnostics credential; never the principal-aware app pool. */
export async function loadCuratedSystemHealthSnapshot(): Promise<CuratedSystemHealthSnapshot> {
  const result = await getSaasIsolationOperatorPool().query<{ snapshot: unknown }>(
    "SELECT app.read_curated_system_health() AS snapshot",
  );
  const row = result.rows[0];
  if (!row) throw new Error("curated_system_health_snapshot_missing");
  return curatedSystemHealthSnapshotSchema.parse(row.snapshot);
}

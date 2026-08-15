import { z } from 'zod';
import { getSaasIsolationOperatorPool } from '@/infra/db/saasIsolationTelemetry';
import { runPgPoolPgText } from '@/infra/db/runWebappSql';
import type { TenantIsolationCanarySnapshot } from '@/modules/operator-health/ports';

const nonNegativeNumber = z.number().finite().nonnegative();
const nullableIso = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), 'invalid timestamp')
  .nullable();

const safeProviderErrorCodeSchema = z.enum([
  'BadJwtToken',
  'BadCertificate',
  'BadCertificateEnvironment',
  'ExpiredProviderToken',
  'InvalidProviderToken',
  'MissingProviderToken',
  'TopicDisallowed',
  'DeviceTokenNotForTopic',
  'Unregistered',
]);

const safeMetaSchema = z
  .object({
    failed: nonNegativeNumber.optional(),
    consecutiveCronFailures: nonNegativeNumber.optional(),
    consecutiveFailRuns: nonNegativeNumber.optional(),
    telegram: z.enum(['ok', 'fail', 'skipped_not_configured', 'no_data']).optional(),
    max: z.enum(['ok', 'fail', 'skipped_not_configured', 'no_data']).optional(),
    rubitime: z.enum(['ok', 'fail', 'skipped_not_configured', 'no_data']).optional(),
    google_calendar: z.enum(['ok', 'fail', 'skipped_not_configured', 'no_data']).optional(),
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
    confirmedSentLast24h: nonNegativeNumber.optional(),
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
    lastProviderStatusCode: z.number().int().min(100).max(599).nullable().optional().default(null),
    lastErrorReason: z
      .string()
      .regex(/^provider_[a-z0-9_]{1,64}$/)
      .nullable(),
    lastErrorMessage: safeProviderErrorCodeSchema.nullable(),
  })
  .strict();

const previewStatusCountsSchema = z
  .object({
    pending: nonNegativeNumber,
    ready: nonNegativeNumber,
    failed: nonNegativeNumber,
    skipped: nonNegativeNumber,
  })
  .strict();

const playbackEventCountsSchema = z
  .object({
    hls_fatal: nonNegativeNumber,
    video_error: nonNegativeNumber,
    hls_import_failed: nonNegativeNumber,
    playback_refetch_failed: nonNegativeNumber,
    playback_refetch_exception: nonNegativeNumber,
    hls_js_unsupported: nonNegativeNumber,
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
    mediaPreview: z
      .object({
        stalePendingCount: nonNegativeNumber,
        byMimeAndStatus: z
          .object({
            'video/quicktime': previewStatusCountsSchema,
            'image/heic': previewStatusCountsSchema,
            'image/heif': previewStatusCountsSchema,
          })
          .strict(),
      })
      .strict(),
    videoPlaybackClient: z
      .object({
        windowHours: z.literal(24),
        totalErrors: nonNegativeNumber,
        totalErrorsLast1h: nonNegativeNumber,
        byEvent: playbackEventCountsSchema,
        byEventLast1h: playbackEventCountsSchema,
        byDelivery: z
          .object({ hls: nonNegativeNumber, mp4: nonNegativeNumber, file: nonNegativeNumber })
          .strict(),
        likelyLooping: z.boolean(),
        recent: z.tuple([]),
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
    outboundProviderIncidents: z
      .object({
        openCount: nonNegativeNumber,
        acknowledgedCount: nonNegativeNumber,
        unacknowledgedCount: nonNegativeNumber,
      })
      .strict()
      .default({ openCount: 0, acknowledgedCount: 0, unacknowledgedCount: 0 }),
    outgoingDelivery: queueSchema,
    integratorPushOutbox: queueSchema,
    remindersPipeline: z
      .object({
        windowHours: z.literal(24),
        outgoingReminderDispatch: z
          .object({
            due: nonNegativeNumber,
            dead: nonNegativeNumber,
            processing: nonNegativeNumber,
          })
          .strict(),
        occurrenceHistory: z
          .object({ sent: nonNegativeNumber, failed: nonNegativeNumber })
          .strict(),
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
            source: z.enum(['telegram', 'max', 'rubitime']),
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

const curatedPlaybackHealthMetricsSchema = z
  .object({
    byDelivery: z
      .object({ hls: nonNegativeNumber, mp4: nonNegativeNumber, file: nonNegativeNumber })
      .strict(),
    fallbackTotal: nonNegativeNumber,
    totalResolutions: nonNegativeNumber,
    uniquePlaybackPairsFirstSeenInWindow: nonNegativeNumber,
  })
  .strict();

export const curatedPlaybackHealthSnapshotSchema = z
  .object({
    '24': curatedPlaybackHealthMetricsSchema,
    '1': curatedPlaybackHealthMetricsSchema,
    hlsProxy: z
      .object({
        windowHours: z.literal(24),
        errorsTotal24h: nonNegativeNumber,
        errorsTotal1h: nonNegativeNumber,
        byReason: z.record(z.string(), nonNegativeNumber),
        byReasonLast1h: z.record(z.string(), nonNegativeNumber),
        degraded: z.boolean(),
        recent: z.tuple([]),
      })
      .strict(),
  })
  .strict();

export type CuratedPlaybackHealthSnapshot = z.infer<typeof curatedPlaybackHealthSnapshotSchema>;

const tenantIsolationCanarySnapshotSchema = z
  .object({
    organizations: z
      .array(
        z
          .object({
            organizationId: z.string().uuid(),
            isActive: z.boolean(),
            memberRowCount: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(4_096),
    truncated: z.boolean(),
  })
  .strict();

/** Uses the already-protected diagnostics credential; never the principal-aware app pool. */
export async function loadCuratedSystemHealthSnapshot(): Promise<CuratedSystemHealthSnapshot> {
  const result = await runPgPoolPgText<{
    snapshot: unknown;
    outbound_provider_incidents: unknown;
  }>(
    getSaasIsolationOperatorPool(),
    'SELECT app.read_curated_system_health() AS snapshot, app.read_outbound_provider_incident_health() AS outbound_provider_incidents',
  );
  const row = result.rows[0];
  if (!row) throw new Error('curated_system_health_snapshot_missing');
  const snapshot =
    typeof row.snapshot === 'object' && row.snapshot !== null
      ? { ...row.snapshot, outboundProviderIncidents: row.outbound_provider_incidents }
      : row.snapshot;
  return curatedSystemHealthSnapshotSchema.parse(snapshot);
}

/** Bounded cross-tenant canary through the same protected diagnostics capability. */
export async function loadTenantIsolationCanarySnapshot(): Promise<TenantIsolationCanarySnapshot> {
  const result = await runPgPoolPgText<{ snapshot: unknown }>(
    getSaasIsolationOperatorPool(),
    'SELECT app.read_tenant_isolation_canary() AS snapshot',
  );
  const row = result.rows[0];
  if (!row) throw new Error('tenant_isolation_canary_snapshot_missing');
  return tenantIsolationCanarySnapshotSchema.parse(row.snapshot);
}

/** Uses a redacted SECURITY DEFINER aggregate; the operator role has no source-table access. */
export async function loadCuratedPlaybackHealthSnapshot(): Promise<CuratedPlaybackHealthSnapshot> {
  const result = await runPgPoolPgText<{ snapshot: unknown }>(
    getSaasIsolationOperatorPool(),
    'SELECT app.read_curated_playback_health() AS snapshot',
  );
  const row = result.rows[0];
  if (!row) throw new Error('curated_playback_health_snapshot_missing');
  return curatedPlaybackHealthSnapshotSchema.parse(row.snapshot);
}

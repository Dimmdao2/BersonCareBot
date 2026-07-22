import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationDeliveryChannelAggregate } from "@/modules/notification-delivery/types";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@/infra/db/saasIsolationTelemetry", () => ({
  getSaasIsolationOperatorPool: vi.fn(() => ({ query: queryMock })),
}));

import {
  curatedPlaybackHealthSnapshotSchema,
  curatedSystemHealthSnapshotSchema,
  loadCuratedPlaybackHealthSnapshot,
  loadCuratedSystemHealthSnapshot,
} from "./pgCuratedSystemHealthDiagnostics";

function channel(): NotificationDeliveryChannelAggregate {
  return {
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastProviderStatusCode: null,
    lastErrorReason: null,
    lastErrorMessage: null,
  };
}

function validSnapshot() {
  return {
    schemaVersion: 1,
    config: {
      pipelineEnabled: true,
      reconcileEnabled: true,
      playbackEnabled: false,
      vapidConfigured: true,
      smtpConfigured: false,
    },
    videoTranscode: {
      pendingCount: 1,
      processingCount: 0,
      doneLastHour: 2,
      failedLastHour: 0,
      doneLast24h: 4,
      failedLast24h: 0,
      doneLifetime: 20,
      failedLifetime: 1,
      avgProcessingMsDoneLastHour: 1200,
      oldestPendingAgeSeconds: 10,
      legacyReconcileCandidateCountWithinSizeCap: 3,
      readableVideoReadyWithHlsCount: 5,
    },
    mediaPreview: {
      stalePendingCount: 0,
      byMimeAndStatus: {
        "video/quicktime": { pending: 0, ready: 0, failed: 0, skipped: 0 },
        "image/heic": { pending: 0, ready: 0, failed: 0, skipped: 0 },
        "image/heif": { pending: 0, ready: 0, failed: 0, skipped: 0 },
      },
    },
    videoPlaybackClient: {
      windowHours: 24,
      totalErrors: 0,
      totalErrorsLast1h: 0,
      byEvent: {
        hls_fatal: 0,
        video_error: 0,
        hls_import_failed: 0,
        playback_refetch_failed: 0,
        playback_refetch_exception: 0,
        hls_js_unsupported: 0,
      },
      byEventLast1h: {
        hls_fatal: 0,
        video_error: 0,
        hls_import_failed: 0,
        playback_refetch_failed: 0,
        playback_refetch_exception: 0,
        hls_js_unsupported: 0,
      },
      byDelivery: { hls: 0, mp4: 0, file: 0 },
      likelyLooping: false,
      recent: [],
    },
    operatorJobs: [],
    operatorIncidents: { openCount: 0, occurrenceCount: 0, lastSeenAt: null },
    outgoingDelivery: {
      dueBacklog: 0,
      deadTotal: 0,
      blockedRecipientTotal: 0,
      oldestDueAgeSeconds: null,
      dueByChannel: {},
      dueByKind: { reminder_dispatch: 0 },
      deadByKind: { reminder_dispatch: 0 },
      processingCount: 0,
      reminderProcessingCount: 0,
      lastSentAt: null,
      lastQueueActivityAt: null,
    },
    integratorPushOutbox: {
      dueBacklog: 0,
      deadTotal: 0,
      oldestDueAgeSeconds: null,
      dueByKind: {},
      deadByKind: {},
      processingCount: 0,
      oldestProcessingAgeSeconds: null,
      lastQueueActivityAt: null,
    },
    remindersPipeline: {
      windowHours: 24,
      outgoingReminderDispatch: { due: 0, dead: 0, processing: 0 },
      occurrenceHistory: { sent: 0, failed: 0 },
      deliveryEvents: { sent: 0, failed: 0 },
      patientReminderM2mIdempotencyKeysActive: 0,
    },
    webPush: {
      windowHours: 24,
      activeSubscriptionsCount: 0,
      usersWithSubscriptionCount: 0,
      subscriptionsTouchedLast24h: 0,
    },
    notificationDelivery: {
      windowHours: 24,
      totalAttempts24h: 0,
      byChannel: {
        telegram: channel(),
        max: channel(),
        web_push: channel(),
        email: channel(),
      },
      recentIssues: [],
    },
    integrationWebhookStatus: [],
    operatorHealthDigestLastSentAt: null,
  };
}

describe("curated System Health diagnostics", () => {
  beforeEach(() => queryMock.mockReset());

  it("reads only through the protected aggregate function", async () => {
    queryMock.mockResolvedValue({ rows: [{ snapshot: validSnapshot() }] });
    await expect(loadCuratedSystemHealthSnapshot()).resolves.toMatchObject({ schemaVersion: 1 });
    expect(queryMock).toHaveBeenCalledWith(
      "SELECT app.read_curated_system_health() AS snapshot, app.read_outbound_provider_incident_health() AS outbound_provider_incidents",
    );
  });

  it("rejects raw row identifiers, error text and secret-shaped drift", () => {
    expect(() => curatedSystemHealthSnapshotSchema.parse({
      ...validSnapshot(),
      rawIncidentRows: [{ id: "patient-id", errorDetail: "secret" }],
    })).toThrow();
    expect(() => curatedSystemHealthSnapshotSchema.parse({
      ...validSnapshot(),
      config: { ...validSnapshot().config, privateKey: "secret" },
    })).toThrow();
  });

  it("accepts only bounded provider diagnostics", () => {
    const snapshot = validSnapshot();
    snapshot.notificationDelivery.byChannel.web_push = {
      ...channel(),
      lastProviderStatusCode: 403,
      lastErrorReason: "provider_error",
      lastErrorMessage: "BadJwtToken",
    };
    expect(() => curatedSystemHealthSnapshotSchema.parse(snapshot)).not.toThrow();

    const unsafe = validSnapshot();
    unsafe.notificationDelivery.byChannel.web_push = {
      ...channel(),
      lastProviderStatusCode: 403,
      lastErrorReason: "provider_error",
      lastErrorMessage: "Dmitry_Berson",
    };
    expect(() => curatedSystemHealthSnapshotSchema.parse(unsafe)).toThrow();
  });

  it("reads playback metrics only through the protected aggregate function", async () => {
    const metrics = {
      byDelivery: { hls: 3, mp4: 2, file: 1 },
      fallbackTotal: 1,
      totalResolutions: 6,
      uniquePlaybackPairsFirstSeenInWindow: 4,
    };
    const hlsProxy = {
      windowHours: 24,
      errorsTotal24h: 0,
      errorsTotal1h: 0,
      byReason: {},
      byReasonLast1h: {},
      degraded: false,
      recent: [],
    };
    queryMock.mockResolvedValue({ rows: [{ snapshot: { "24": metrics, "1": metrics, hlsProxy } }] });

    await expect(loadCuratedPlaybackHealthSnapshot()).resolves.toEqual({
      "24": metrics,
      "1": metrics,
      hlsProxy,
    });
    expect(queryMock).toHaveBeenCalledWith("SELECT app.read_curated_playback_health() AS snapshot");
  });

  it("rejects raw playback rows and identifiers", () => {
    const metrics = {
      byDelivery: { hls: 0, mp4: 0, file: 0 },
      fallbackTotal: 0,
      totalResolutions: 0,
      uniquePlaybackPairsFirstSeenInWindow: 0,
    };
    expect(() => curatedPlaybackHealthSnapshotSchema.parse({
      "24": { ...metrics, rows: [{ userId: "not-allowed" }] },
      "1": metrics,
      hlsProxy: {
        windowHours: 24,
        errorsTotal24h: 0,
        errorsTotal1h: 0,
        byReason: {},
        byReasonLast1h: {},
        degraded: false,
        recent: [],
      },
    })).toThrow();
  });

});

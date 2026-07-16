import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@/infra/db/saasIsolationTelemetry", () => ({
  getSaasIsolationOperatorPool: vi.fn(() => ({ query: queryMock })),
}));

import {
  curatedSystemHealthSnapshotSchema,
  loadCuratedSystemHealthSnapshot,
} from "./pgCuratedSystemHealthDiagnostics";

function channel() {
  return {
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
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
    expect(queryMock).toHaveBeenCalledWith("SELECT app.read_curated_system_health() AS snapshot");
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

});

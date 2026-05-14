import { describe, expect, it } from "vitest";
import { computeWorkerStatus } from "./SystemHealthSection";

describe("computeWorkerStatus", () => {
  it("returns idle when projection queue is empty", () => {
    const result = computeWorkerStatus({
      webappDb: "up",
      integratorApi: { status: "ok", db: "up" },
      projection: {
        status: "ok",
        snapshot: {
          pendingCount: 0,
          processingCount: 0,
          lastSuccessAt: "2026-04-16T10:00:00.000Z",
        },
      },
      mediaCronWorkers: { status: "configured" },
      mediaPreview: {
        status: "ok",
        stalePendingCount: 0,
        byMimeAndStatus: {
          "video/quicktime": { pending: 0, ready: 0, failed: 0, skipped: 0 },
          "image/heic": { pending: 0, ready: 0, failed: 0, skipped: 0 },
          "image/heif": { pending: 0, ready: 0, failed: 0, skipped: 0 },
        },
      },
      videoPlayback: {
        status: "ok",
        windowHours: 24,
        playbackApiEnabled: false,
        byDelivery: { hls: 0, mp4: 0, file: 0 },
        fallbackTotal: 0,
        totalResolutions: 0,
        uniquePlaybackPairsFirstSeenInWindow: 0,
        byDeliveryLast1h: { hls: 0, mp4: 0, file: 0 },
        fallbackTotalLast1h: 0,
        totalResolutionsLast1h: 0,
      },
      videoTranscode: {
        status: "ok",
        pipelineEnabled: false,
        reconcileEnabled: false,
        pendingCount: 0,
        processingCount: 0,
        doneLastHour: 0,
        failedLastHour: 0,
        doneLast24h: 0,
        failedLast24h: 0,
        doneLifetime: 0,
        failedLifetime: 0,
        avgProcessingMsDoneLastHour: null,
        oldestPendingAgeSeconds: null,
        legacyReconcileCandidateCountWithinSizeCap: 0,
        readableVideoReadyWithHlsCount: 0,
        lastReconcileTick: null,
      },
      fetchedAt: "2026-04-16T10:00:00.000Z",
    });
    expect(result.worker).toBe("idle");
  });

  it("returns no_activity when queue has items and last success is stale", () => {
    const oldIso = "2020-01-01T00:00:00.000Z";
    const result = computeWorkerStatus({
      webappDb: "up",
      integratorApi: { status: "ok", db: "up" },
      projection: {
        status: "ok",
        snapshot: {
          pendingCount: 1,
          processingCount: 0,
          lastSuccessAt: oldIso,
        },
      },
      mediaCronWorkers: { status: "configured" },
      mediaPreview: {
        status: "ok",
        stalePendingCount: 0,
        byMimeAndStatus: {
          "video/quicktime": { pending: 0, ready: 0, failed: 0, skipped: 0 },
          "image/heic": { pending: 0, ready: 0, failed: 0, skipped: 0 },
          "image/heif": { pending: 0, ready: 0, failed: 0, skipped: 0 },
        },
      },
      videoPlayback: {
        status: "ok",
        windowHours: 24,
        playbackApiEnabled: false,
        byDelivery: { hls: 0, mp4: 0, file: 0 },
        fallbackTotal: 0,
        totalResolutions: 0,
        uniquePlaybackPairsFirstSeenInWindow: 0,
        byDeliveryLast1h: { hls: 0, mp4: 0, file: 0 },
        fallbackTotalLast1h: 0,
        totalResolutionsLast1h: 0,
      },
      videoTranscode: {
        status: "ok",
        pipelineEnabled: false,
        reconcileEnabled: false,
        pendingCount: 0,
        processingCount: 0,
        doneLastHour: 0,
        failedLastHour: 0,
        doneLast24h: 0,
        failedLast24h: 0,
        doneLifetime: 0,
        failedLifetime: 0,
        avgProcessingMsDoneLastHour: null,
        oldestPendingAgeSeconds: null,
        legacyReconcileCandidateCountWithinSizeCap: 0,
        readableVideoReadyWithHlsCount: 0,
        lastReconcileTick: null,
      },
      fetchedAt: "2026-04-16T10:00:00.000Z",
    });
    expect(result.worker).toBe("no_activity");
  });
});

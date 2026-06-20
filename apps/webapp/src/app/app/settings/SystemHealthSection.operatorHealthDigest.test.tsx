/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SystemHealthSection } from "./SystemHealthSection";

const healthShell = {
  webappDb: "up",
  integratorApi: { status: "ok" },
  projection: { status: "ok", snapshot: { pendingCount: 0, processingCount: 0 } },
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
    windowHoursShort: 1,
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
  operatorIncidentsOpen: [],
  backupJobs: {},
  outgoingDelivery: {
    dueBacklog: 0,
    deadTotal: 0,
    oldestDueAgeSeconds: null,
    dueByKind: {},
    deadByKind: {},
    dueByChannel: {},
    processingCount: 0,
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
  meta: { probes: {} },
  fetchedAt: "2026-06-09T10:00:00.000Z",
};

describe("SystemHealthSection operator health digest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows last digest timestamp when API returns operatorHealthDigest.lastSentAt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(JSON.stringify({
            ...healthShell,
            operatorHealthDigest: { lastSentAt: "2026-06-09T06:00:00.000Z" },
          })),
      }),
    );

    render(<SystemHealthSection />);

    await waitFor(() => {
      expect(screen.getByText(/Последняя сводка:/)).toBeInTheDocument();
    });
  });
});

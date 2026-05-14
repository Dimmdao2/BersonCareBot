/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SystemHealthSection } from "./SystemHealthSection";

const mediaPreviewShell = {
  status: "ok" as const,
  stalePendingCount: 0,
  byMimeAndStatus: {
    "video/quicktime": { pending: 0, ready: 0, failed: 0, skipped: 0 },
    "image/heic": { pending: 0, ready: 0, failed: 0, skipped: 0 },
    "image/heif": { pending: 0, ready: 0, failed: 0, skipped: 0 },
  },
};

const videoPlaybackShell = {
  status: "ok" as const,
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
};

const videoTranscodeShell = {
  status: "ok" as const,
  pipelineEnabled: false,
  reconcileEnabled: false,
  pendingCount: 0,
  processingCount: 0,
  doneLastHour: 0,
  failedLastHour: 0,
  avgProcessingMsDoneLastHour: null as number | null,
  oldestPendingAgeSeconds: null as number | null,
};

const probeShell = {
  webappDb: { status: "ok", durationMs: 1 },
  integratorApi: { status: "ok", durationMs: 1 },
  projection: { status: "ok", durationMs: 1 },
  mediaPreview: { status: "ok", durationMs: 1 },
  videoPlayback: { status: "ok", durationMs: 1 },
  videoTranscode: { status: "ok", durationMs: 1 },
  operatorIncidents: { status: "ok", durationMs: 1 },
  operatorBackupJobs: { status: "ok", durationMs: 1 },
  outgoingDelivery: { status: "ok", durationMs: 1 },
};

function healthJson(overrides: Record<string, unknown> = {}) {
  return {
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
    mediaPreview: mediaPreviewShell,
    videoPlayback: videoPlaybackShell,
    videoTranscode: videoTranscodeShell,
    operatorIncidentsOpen: [],
    backupJobs: {},
    outgoingDelivery: {
      dueBacklog: 0,
      deadTotal: 0,
      oldestDueAgeSeconds: null,
      dueByChannel: {},
      processingCount: 0,
      lastSentAt: null,
      lastQueueActivityAt: null,
    },
    meta: { probes: probeShell },
    fetchedAt: "2026-04-16T10:00:00.000Z",
    ...overrides,
  };
}

describe("SystemHealthSection operator incidents", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows operator incident title with count when API returns open incidents", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          healthJson({
            operatorIncidentsOpen: [
              {
                id: "550e8400-e29b-41d4-a716-446655440000",
                dedupKey: "k",
                direction: "outbound",
                integration: "max",
                errorClass: "max_probe_failed",
                errorDetail: "detail",
                openedAt: "2026-04-16T09:00:00.000Z",
                lastSeenAt: "2026-04-16T09:30:00.000Z",
                occurrenceCount: 2,
              },
            ],
            meta: {
              probes: {
                ...probeShell,
                operatorIncidents: { status: "degraded", durationMs: 2 },
              },
            },
          }),
        ),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SystemHealthSection />);

    await waitFor(() => {
      expect(screen.getByText(/Операторские инциденты \(1\)/)).toBeInTheDocument();
    });
  });
});

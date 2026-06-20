/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  doneLast24h: 0,
  failedLast24h: 0,
  doneLifetime: 0,
  failedLifetime: 0,
  avgProcessingMsDoneLastHour: null as number | null,
  oldestPendingAgeSeconds: null as number | null,
  legacyReconcileCandidateCountWithinSizeCap: 0,
  readableVideoReadyWithHlsCount: 0,
  lastReconcileTick: null as null,
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
  integratorPushOutbox: { status: "ok", durationMs: 1 },
};

function healthJson(overrides: Record<string, unknown> = {}) {
  return {
    webappDb: "up",
    integratorApi: { status: "ok", db: "up" },
    projection: { status: "ok", snapshot: { pendingCount: 0, processingCount: 0, lastSuccessAt: null } },
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
    probeOutbound: { consecutiveFailRuns: 2 },
    integrations: {
      rubitime: {
        outbound: { status: "ok", lastFinishedAt: "2026-06-09T10:00:00.000Z" },
        inbound: {
          receivedAt: "2026-06-09T09:30:00.000Z",
          processedOk: false,
          errorClass: "webhook_parse_failed",
          httpStatusReturned: 200,
          detail: "bad body",
        },
      },
      telegram: {
        outbound: { status: "fail", lastFinishedAt: "2026-06-09T10:00:00.000Z" },
        inbound: { receivedAt: null, processedOk: null, errorClass: null, httpStatusReturned: null, detail: null },
      },
      max: {
        outbound: { status: "skipped_not_configured", lastFinishedAt: null },
        inbound: { receivedAt: null, processedOk: null, errorClass: null, httpStatusReturned: null, detail: null },
      },
      google_calendar: {
        outbound: { status: "ok", lastFinishedAt: "2026-06-09T10:00:00.000Z" },
      },
    },
    meta: { probes: probeShell },
    fetchedAt: "2026-06-09T10:05:00.000Z",
    ...overrides,
  };
}

describe("SystemHealthSection integrations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders integrations accordion with outbound and inbound rows", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(healthJson())),
      }),
    );

    render(<SystemHealthSection />);

    await waitFor(() => {
      expect(screen.getAllByText("Интеграции").length).toBeGreaterThanOrEqual(2);
    });

    const accordionTrigger = screen.getByRole("button", { name: /Интеграции/i });
    await user.click(accordionTrigger);

    expect(screen.getByText("Подряд неуспешных проб")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getAllByText("Исходящий (API)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Входящий (вебхук)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ошибка").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("не удалось разобрать тело вебхука")).toBeInTheDocument();
  });
});

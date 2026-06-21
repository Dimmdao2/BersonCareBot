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

function healthJsonWithDead(outDead: number, ipoDead: number, projectionDead = 0, reminderDead = 0) {
  return {
    webappDb: "up",
    integratorApi: { status: "ok", db: "up" },
    projection: {
      status: projectionDead > 0 ? "degraded" : "ok",
      snapshot: {
        pendingCount: 0,
        processingCount: 0,
        deadCount: projectionDead,
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
      deadTotal: outDead,
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
      deadTotal: ipoDead,
      oldestDueAgeSeconds: null,
      dueByKind: {},
      deadByKind: {},
      processingCount: 0,
      oldestProcessingAgeSeconds: null,
      lastQueueActivityAt: null,
    },
    remindersPipeline: {
      windowHours: 24,
      outgoingReminderDispatch: { due: 0, dead: reminderDead, processing: 0 },
      occurrenceHistory: { sent: 0, failed: 0 },
      deliveryEvents: { sent: 0, failed: 0 },
      patientReminderM2mIdempotencyKeysActive: 0,
    },
    meta: { probes: probeShell },
    fetchedAt: "2026-04-16T10:00:00.000Z",
  };
}

describe("SystemHealthSection health failure archive controls", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows clear-dead button for outgoing queue when deadTotal > 0 (accordion expanded)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(healthJsonWithDead(2, 0))),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SystemHealthSection />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: /Очередь доставки уведомлений/i }));

    expect(await screen.findByRole("button", { name: /Заархивировать и сбросить dead/i })).toBeInTheDocument();
  });

  it("shows clear-dead button for integrator outbox when deadTotal > 0", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(healthJsonWithDead(0, 1))),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SystemHealthSection />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: /Очередь синка в integrator/i }));

    const buttons = await screen.findAllByRole("button", { name: /Заархивировать и сбросить dead/i });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows clear-dead button for projection when deadCount > 0", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(healthJsonWithDead(0, 0, 2, 0))),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SystemHealthSection />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: /Синхронизация событий/i }));

    expect(await screen.findByRole("button", { name: /Заархивировать и сбросить dead/i })).toBeInTheDocument();
  });

  it("shows clear-dead button for reminders when reminder_dispatch dead > 0", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(healthJsonWithDead(0, 0, 0, 1))),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SystemHealthSection />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: /^Напоминания/i }));

    expect(await screen.findByRole("button", { name: /Заархивировать и сбросить dead/i })).toBeInTheDocument();
  });

  it("confirm dialog calls clear API for projection and reloads system-health", async () => {
    const user = userEvent.setup();
    let healthLoads = 0;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/admin/system-health")) {
        healthLoads += 1;
        const projectionDead = healthLoads === 1 ? 2 : 0;
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(healthJsonWithDead(0, 0, projectionDead, 0))),
        });
      }
      if (url.includes("/api/admin/health-failure-archive/clear") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ ok: true, inserted: 2, deleted: 2 })),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SystemHealthSection />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: /Синхронизация событий/i }));
    await user.click(await screen.findByRole("button", { name: /Заархивировать и сбросить dead/i }));
    await user.click(await screen.findByRole("button", { name: /^Подтвердить$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/health-failure-archive/clear",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ probe: "projection_outbox" }),
        }),
      );
    });
    await waitFor(() => {
      expect(healthLoads).toBeGreaterThanOrEqual(2);
    });
  });
});

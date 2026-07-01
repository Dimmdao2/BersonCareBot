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
      text: () =>
        Promise.resolve(JSON.stringify(
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
        )),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SystemHealthSection />);

    await waitFor(() => {
      expect(screen.getByText(/Открытые инциденты \(1\)/)).toBeInTheDocument();
    });
  });

  it("shows resolve-all button when open incidents exist", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(JSON.stringify(
          healthJson({
            operatorIncidentsOpen: [
              {
                id: "550e8400-e29b-41d4-a716-446655440000",
                dedupKey: "k",
                direction: "outbound",
                integration: "google_calendar",
                errorClass: "unknown_error_class",
                errorDetail: null,
                openedAt: "2026-04-16T09:00:00.000Z",
                lastSeenAt: "2026-04-16T09:30:00.000Z",
                occurrenceCount: 1,
              },
            ],
            meta: {
              probes: {
                ...probeShell,
                operatorIncidents: { status: "degraded", durationMs: 2 },
              },
            },
          }),
        )),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SystemHealthSection />);

    await waitFor(() => {
      expect(screen.getByText(/Открытые инциденты \(1\)/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Открытые инциденты \(1\)/i }));

    expect(await screen.findByRole("button", { name: /Закрыть все открытые/i })).toBeInTheDocument();
  });

  it("confirm dialog calls resolve-all and reloads system-health", async () => {
    const user = userEvent.setup();
    const openIncident = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      dedupKey: "k",
      direction: "outbound",
      integration: "google_calendar",
      errorClass: "unknown_error_class",
      errorDetail: null,
      openedAt: "2026-04-16T09:00:00.000Z",
      lastSeenAt: "2026-04-16T09:30:00.000Z",
      occurrenceCount: 1,
    };
    let healthLoads = 0;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/admin/system-health")) {
        healthLoads += 1;
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(JSON.stringify(
              healthJson({
                operatorIncidentsOpen: healthLoads === 1 ? [openIncident] : [],
                meta: {
                  probes: {
                    ...probeShell,
                    operatorIncidents: { status: healthLoads === 1 ? "degraded" : "ok", durationMs: 2 },
                  },
                },
              }),
            )),
        });
      }
      if (url.includes("/api/admin/operator-incidents/resolve-all") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ ok: true, resolved: 1 })),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SystemHealthSection />);

    await waitFor(() => {
      expect(screen.getByText(/Открытые инциденты \(1\)/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Открытые инциденты \(1\)/i }));
    await user.click(await screen.findByRole("button", { name: /Закрыть все открытые/i }));
    await user.click(await screen.findByRole("button", { name: /^Подтвердить$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/operator-incidents/resolve-all",
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(healthLoads).toBeGreaterThanOrEqual(2);
    });
    await waitFor(() => {
      expect(screen.getByText(/Открытые инциденты \(0\)/)).toBeInTheDocument();
    });
  });
});

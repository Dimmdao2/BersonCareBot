/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SYSTEM_HEALTH_TECH_DIAGNOSTICS_TESTID, SystemHealthSection } from "./SystemHealthSection";

/** Text outside `Техническая диагностика` blocks — plan §7 / audit. */
function collectPrimaryLayerText(root: HTMLElement): string {
  const chunks: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (el.getAttribute("data-testid") === SYSTEM_HEALTH_TECH_DIAGNOSTICS_TESTID) return;
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") return;
    }
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      chunks.push(node.textContent.trim());
    }
    for (const c of Array.from(node.childNodes)) walk(c);
  };
  walk(root);
  return chunks.join("\n");
}

/** Все accordion-триггеры блока карточек (кроме «Обновить» в первой карточке). */
async function expandAllServiceAccordions(): Promise<void> {
  const patterns = [
    /База данных веб-приложения/,
    /Сервер интеграций/,
    /Синхронизация событий/,
    /Фоновая обработка интеграций/,
    /Сервер веб-приложения/,
    /Фоновая обработка медиа/,
    /Превью файлов медиатеки/,
    /Видеоплеер у пациентов/,
    /Потоковая выдача HLS \(прокси\)/,
    /Транскод HLS и очередь/,
    /Открытые инциденты \(\d+\)/,
    /Бэкапы базы данных/,
    /Очередь доставки уведомлений/,
  ];
  for (const name of patterns) {
    await userEvent.click(screen.getByRole("button", { name }));
  }
}

const mediaPreviewShell = {
  status: "ok" as const,
  stalePendingCount: 2,
  byMimeAndStatus: {
    "video/quicktime": { pending: 3, ready: 1, failed: 0, skipped: 0 },
    "image/heic": { pending: 0, ready: 0, failed: 0, skipped: 0 },
    "image/heif": { pending: 0, ready: 0, failed: 0, skipped: 0 },
  },
};

const probeShell = {
  webappDb: { status: "ok", durationMs: 11 },
  integratorApi: { status: "ok", durationMs: 12 },
  projection: { status: "ok", durationMs: 13 },
  mediaPreview: { status: "ok", durationMs: 14 },
  videoPlayback: { status: "ok", durationMs: 15 },
  videoPlaybackClient: { status: "ok", durationMs: 16 },
  videoTranscode: { status: "ok", durationMs: 17 },
  videoHlsProxy: { status: "ok", durationMs: 17 },
  operatorIncidents: { status: "degraded", durationMs: 18 },
  operatorBackupJobs: { status: "ok", durationMs: 19 },
  outgoingDelivery: { status: "ok", durationMs: 20 },
};

const videoPlaybackShell = {
  status: "ok" as const,
  windowHours: 24,
  windowHoursShort: 1,
  playbackApiEnabled: true,
  byDelivery: { hls: 10, mp4: 2, file: 1 },
  fallbackTotal: 0,
  totalResolutions: 13,
  uniquePlaybackPairsFirstSeenInWindow: 4,
  byDeliveryLast1h: { hls: 1, mp4: 0, file: 0 },
  fallbackTotalLast1h: 0,
  totalResolutionsLast1h: 1,
};

const videoTranscodeShell = {
  status: "ok" as const,
  pipelineEnabled: true,
  reconcileEnabled: true,
  pendingCount: 2,
  processingCount: 1,
  doneLastHour: 4,
  failedLastHour: 0,
  doneLast24h: 40,
  failedLast24h: 1,
  doneLifetime: 900,
  failedLifetime: 12,
  avgProcessingMsDoneLastHour: 8000,
  oldestPendingAgeSeconds: 3600,
  legacyReconcileCandidateCountWithinSizeCap: 7,
  readableVideoReadyWithHlsCount: 120,
  lastReconcileTick: {
    jobKey: "media_transcode.reconcile",
    jobFamily: "media",
    lastStatus: "success",
    lastFinishedAt: "2026-04-16T10:05:00.000Z",
    lastSuccessAt: "2026-04-16T10:05:00.000Z",
    lastFailureAt: null,
    lastDurationMs: 900,
    lastError: null,
    metaJson: { queuedNew: 2 },
  },
};

function fetchHealthJson(): Record<string, unknown> {
  return {
    webappDb: "up",
    integratorApi: { status: "ok", db: "up" },
    projection: {
      status: "ok",
      snapshot: {
        pendingCount: 2,
        processingCount: 1,
        lastSuccessAt: "2026-04-16T10:00:00.000Z",
        deadCount: 0,
        cancelledCount: 0,
      },
    },
    mediaCronWorkers: { status: "configured" },
    mediaPreview: mediaPreviewShell,
    videoPlayback: videoPlaybackShell,
    videoPlaybackClient: {
      status: "ok",
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
    videoHlsProxy: {
      status: "ok",
      windowHours: 24,
      errorsTotal24h: 0,
      errorsTotal1h: 0,
      byReason: {},
      byReasonLast1h: {},
      degraded: false,
      recent: [],
    },
    videoTranscode: videoTranscodeShell,
    operatorIncidentsOpen: [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        dedupKey: "outbound:max:max_probe_failed",
        direction: "outbound",
        integration: "max",
        errorClass: "max_probe_failed",
        errorDetail: "probe timeout",
        openedAt: "2026-04-16T09:00:00.000Z",
        lastSeenAt: "2026-04-16T09:30:00.000Z",
        occurrenceCount: 2,
      },
    ],
    backupJobs: {
      nightly_dump: {
        lastStatus: "success",
        lastStartedAt: "2026-04-15T03:00:00.000Z",
        lastFinishedAt: "2026-04-15T03:10:00.000Z",
        lastSuccessAt: "2026-04-15T03:10:00.000Z",
        lastFailureAt: null,
        lastDurationMs: 120,
        lastError: null,
      },
    },
    outgoingDelivery: {
      dueBacklog: 2,
      deadTotal: 0,
      oldestDueAgeSeconds: 120,
      dueByKind: {},
      deadByKind: {},
      dueByChannel: { telegram_bot: 2 },
      processingCount: 0,
      lastSentAt: "2026-04-16T09:59:00.000Z",
      lastQueueActivityAt: "2026-04-16T10:00:00.000Z",
    },
    meta: { probes: probeShell },
    fetchedAt: "2026-04-16T10:06:00.000Z",
  };
}

describe("SystemHealthSection primary-layer invariants", () => {
  it("после раскрытия всех карточек: операторский слой без сыра кода ошибок reconcile / инцидентов и без англоязычных DDL-подписей", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fetchHealthJson(),
      }),
    );
    render(<SystemHealthSection />);

    await waitFor(() => {
      expect(screen.getByText("Сервисы и системные карточки")).toBeInTheDocument();
    });

    expect(screen.getByText("активен")).toBeInTheDocument();
    expect(screen.queryByText(/\bactive\b/i)).not.toBeInTheDocument();

    await expandAllServiceAccordions();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Открытые инциденты/, expanded: true })).toBeInTheDocument();
    });

    const primary = collectPrimaryLayerText(document.body);

    expect(primary).not.toMatch(/Probe\s+status/i);
    expect(primary).not.toMatch(/\bjob_key\b/i);
    expect(primary).not.toMatch(/\bmedia_transcode\.reconcile\b/i);
    expect(primary).not.toMatch(/\bmax_probe_failed\b/);
    expect(primary).not.toMatch(/\bdedup_key\b/i);
    expect(primary).not.toMatch(/max\s+sent_at/i);
    expect(primary).not.toMatch(/PostgreSQL/i);
    expect(primary).not.toMatch(/\bactive\b|\bunknown\b|\bno_activity\b|\bno_signal\b|\bplayback_disabled\b/);

    expect(document.querySelectorAll(`[data-testid="${SYSTEM_HEALTH_TECH_DIAGNOSTICS_TESTID}"]`).length).toBeGreaterThan(
      3,
    );
  });
});

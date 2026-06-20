/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SystemHealthSection } from "./SystemHealthSection";

describe("SystemHealthSection webPushOnlyReminderTick", () => {
  it("shows cron tick summary in Web Push accordion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({
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
            playbackApiEnabled: false,
            byDelivery: { hls: 0, mp4: 0, file: 0 },
            fallbackTotal: 0,
            totalResolutions: 0,
            uniquePlaybackPairsFirstSeenInWindow: 0,
          },
          webPush: {
            windowHours: 24,
            status: "ok",
            vapidConfigured: true,
            activeSubscriptionsCount: 1,
            usersWithSubscriptionCount: 1,
            subscriptionsTouchedLast24h: 0,
            deliveryMetricsInDb: true,
          },
          webPushOnlyReminderTick: {
            status: "ok",
            lastTick: {
              jobKey: "reminders.web_push_only.tick",
              jobFamily: "reminders",
              lastStatus: "success",
              lastFinishedAt: "2026-05-20T10:00:00.000Z",
              lastSuccessAt: "2026-05-20T10:00:00.000Z",
              lastFailureAt: null,
              lastDurationMs: 42,
              lastError: null,
              metaJson: {
                rulesFound: 2,
                plannedUpserts: 0,
                dueClaimed: 0,
                sent: 1,
                failed: 0,
                consecutiveCronFailures: 0,
              },
            },
          },
          notificationDelivery: {
            windowHours: 24,
            status: "no_data",
            vapidConfigured: true,
            smtpConfigured: false,
            totalAttempts24h: 0,
            byChannel: {},
            recentIssues: [],
          },
          meta: { probes: {} },
          fetchedAt: "2026-05-20T10:01:00.000Z",
        }),
      }),
    );

    render(<SystemHealthSection />);

    await waitFor(() => {
      expect(screen.getByText("Web Push (PWA)")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Web Push \(PWA\)/ }));

    await waitFor(() => {
      expect(screen.getByText(/Ожидается cron каждую минуту/)).toBeInTheDocument();
    });

    const sentRow = screen.getByText("Отправлено").closest("motion.div, div");
    expect(sentRow?.textContent).toContain("1");
    expect(screen.getByText("Правил (последний tick)").closest("motion.div, div")?.textContent).toContain("2");
  });
});

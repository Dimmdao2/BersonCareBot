"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { resolveClientEntryChannel } from "@/modules/product-analytics/clientEntryChannel";
import { normalizePageKey } from "@/modules/product-analytics/normalizePageKey";
import type { PatientAnalyticsClientEvent } from "@/modules/product-analytics/ingestSchemas";
import {
  getOrRotateClientSessionId,
  HEARTBEAT_INTERVAL_MS,
  markAppOpenSent,
  shouldSendPageView,
  touchClientSessionActivity,
  wasAppOpenSent,
} from "@/shared/lib/productAnalytics/patientAnalyticsSession";
import { postPatientAnalyticsEvents } from "@/shared/lib/productAnalytics/postPatientAnalyticsEvents";

function buildBaseEvent(
  eventType: PatientAnalyticsClientEvent["eventType"],
  clientSessionId: string,
): Pick<PatientAnalyticsClientEvent, "eventType" | "entryChannel" | "clientSessionId"> {
  return {
    eventType,
    entryChannel: resolveClientEntryChannel(),
    clientSessionId,
  };
}

/** Client ingest: app_open (once per session), page_view, heartbeat. */
export function PatientAnalyticsReporter() {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    const clientSessionId = getOrRotateClientSessionId();
    touchClientSessionActivity();

    if (!wasAppOpenSent()) {
      markAppOpenSent();
      void postPatientAnalyticsEvents([
        {
          ...buildBaseEvent("app_open", clientSessionId),
          idempotencyKey: `app_open:${clientSessionId}`,
        },
      ]);
    }
  }, []);

  useEffect(() => {
    const pageKey = normalizePageKey(pathname);
    if (!pageKey) return;

    const now = Date.now();
    if (!shouldSendPageView(pageKey, now)) return;

    const clientSessionId = getOrRotateClientSessionId(now);
    touchClientSessionActivity(now);

    void postPatientAnalyticsEvents([
      {
        ...buildBaseEvent("page_view", clientSessionId),
        pathname,
        pageKey,
        idempotencyKey: `page_view:${clientSessionId}:${pageKey}`,
      },
    ]);
  }, [pathname]);

  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      const now = Date.now();
      const clientSessionId = getOrRotateClientSessionId(now);
      touchClientSessionActivity(now);

      void postPatientAnalyticsEvents([
        {
          ...buildBaseEvent("heartbeat", clientSessionId),
          idempotencyKey: `heartbeat:${clientSessionId}:${Math.floor(now / HEARTBEAT_INTERVAL_MS)}`,
        },
      ]);
    };

    tick();
    const id = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return null;
}

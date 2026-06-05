import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { getCachedWarmupSlugs } from "@/app-layer/reminders/warmupSlugCache";
import { routePaths } from "@/app-layer/routes/paths";
import { patientAnalyticsEventsBodySchema } from "@/modules/product-analytics/ingestSchemas";
import { normalizePageKey } from "@/modules/product-analytics/normalizePageKey";
import {
  groupProductAnalyticsPageKey,
  patientContentSlugFromPath,
} from "@/modules/product-analytics/productAnalyticsPageKey";
import type { ProductAnalyticsIngestEvent } from "@/modules/product-analytics/types";

function resolvePageKeyFromClientEvent(
  event: { pageKey?: string; pathname?: string },
  warmupSlugs: Set<string>,
): string | undefined {
  const pathname = event.pathname?.trim();
  if (pathname) {
    const slug = patientContentSlugFromPath(pathname);
    const isWarmupContent = slug != null && warmupSlugs.has(slug);
    return normalizePageKey(pathname, { isWarmupContent }) ?? undefined;
  }
  if (event.pageKey?.trim()) {
    return groupProductAnalyticsPageKey(event.pageKey.trim());
  }
  return undefined;
}

/** POST /api/patient/analytics/events — batch ingest app_open, page_view, heartbeat. */
export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = patientAnalyticsEventsBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const userId = gate.session.user.userId;
  const warmupSlugs = await getCachedWarmupSlugs();

  const ingest: ProductAnalyticsIngestEvent[] = [];
  for (const event of parsed.data.events) {
    if (event.eventType === "page_view") {
      const pageKey = resolvePageKeyFromClientEvent(event, warmupSlugs);
      if (!pageKey) continue;
      ingest.push({
        eventType: "page_view",
        entryChannel: event.entryChannel,
        occurredAt: event.occurredAt,
        pageKey,
        userId,
        clientSessionId: event.clientSessionId,
        metadata: event.idempotencyKey ? { idempotencyKey: event.idempotencyKey } : undefined,
      });
      continue;
    }

    ingest.push({
      eventType: event.eventType,
      entryChannel: event.entryChannel,
      occurredAt: event.occurredAt,
      userId,
      clientSessionId: event.clientSessionId,
      metadata: event.idempotencyKey ? { idempotencyKey: event.idempotencyKey } : undefined,
    });
  }

  if (ingest.length === 0) {
    return NextResponse.json({ ok: true, accepted: 0 });
  }

  try {
    const deps = buildAppDeps();
    await deps.productAnalytics.recordEventsBatch(ingest);
  } catch (err) {
    const message = err instanceof Error ? err.message : "ingest_failed";
    if (message === "batch_too_large") {
      return NextResponse.json({ ok: false, error: "batch_too_large" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, accepted: ingest.length });
}

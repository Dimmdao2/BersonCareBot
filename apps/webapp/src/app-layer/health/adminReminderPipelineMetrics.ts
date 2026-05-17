import { and, count, eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { reminderDeliveryEvents, reminderOccurrenceHistory } from "../../../db/schema/schema";
import { outgoingDeliveryQueue } from "../../../db/schema/outgoingDeliveryQueue";

/** Matches integrator `enqueueOutgoingDeliveryIfAbsent` kind for patient reminder pushes. */
export const REMINDER_OUTGOING_KIND = "reminder_dispatch";

const WINDOW_HOURS = 24 as const;

export type RemindersPipelineHealthPayload = {
  windowHours: typeof WINDOW_HOURS;
  /** Subset of `outgoing_delivery_queue` for reminder_dispatch only. */
  outgoingReminderDispatch: {
    due: number;
    dead: number;
    processing: number;
  };
  /** `reminder_occurrence_history` rows with `occurred_at` in rolling window (UTC `now()`). */
  occurrenceHistory: { sent: number; failed: number };
  /** `reminder_delivery_events` rows with `created_at` in rolling window. */
  deliveryEvents: { sent: number; failed: number };
};

export function emptyRemindersPipelineHealthPayload(): RemindersPipelineHealthPayload {
  return {
    windowHours: WINDOW_HOURS,
    outgoingReminderDispatch: { due: 0, dead: 0, processing: 0 },
    occurrenceHistory: { sent: 0, failed: 0 },
    deliveryEvents: { sent: 0, failed: 0 },
  };
}

function sumStatus(
  rows: Array<{ status: string; n: unknown }>,
  sentLabel: string,
  failedLabel: string,
): { sent: number; failed: number } {
  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    const n = Number(r.n ?? 0);
    if (r.status === sentLabel) sent += n;
    if (r.status === failedLabel) failed += n;
  }
  return { sent, failed };
}

/**
 * Operator-facing reminder funnel: queue slice + 24h projection facts.
 * Best-effort; returns `{ ok: false }` only on unexpected DB errors.
 */
export async function loadAdminReminderPipelineMetrics(outgoingDelivery: {
  dueByKind: Record<string, number>;
  deadByKind: Record<string, number>;
}): Promise<{ ok: true; value: RemindersPipelineHealthPayload } | { ok: false; errorCode: string }> {
  try {
    const db = getDrizzle();
    const due = outgoingDelivery.dueByKind[REMINDER_OUTGOING_KIND] ?? 0;
    const dead = outgoingDelivery.deadByKind[REMINDER_OUTGOING_KIND] ?? 0;

    const [processingRows, occRows, evRows] = await Promise.all([
      db
        .select({ c: count() })
        .from(outgoingDeliveryQueue)
        .where(
          and(eq(outgoingDeliveryQueue.kind, REMINDER_OUTGOING_KIND), eq(outgoingDeliveryQueue.status, "processing")),
        ),
      db
        .select({
          status: reminderOccurrenceHistory.status,
          n: count(),
        })
        .from(reminderOccurrenceHistory)
        .where(sql`${reminderOccurrenceHistory.occurredAt} >= now() - interval '24 hours'`)
        .groupBy(reminderOccurrenceHistory.status),
      db
        .select({
          status: reminderDeliveryEvents.status,
          n: count(),
        })
        .from(reminderDeliveryEvents)
        .where(sql`${reminderDeliveryEvents.createdAt} >= now() - interval '24 hours'`)
        .groupBy(reminderDeliveryEvents.status),
    ]);

    const occurrenceHistory = sumStatus(
      occRows.map((r) => ({ status: r.status, n: r.n })),
      "sent",
      "failed",
    );
    const deliveryEvents = sumStatus(
      evRows.map((r) => ({ status: r.status, n: r.n })),
      "sent",
      "failed",
    );

    return {
      ok: true,
      value: {
        windowHours: WINDOW_HOURS,
        outgoingReminderDispatch: {
          due,
          dead,
          processing: Number(processingRows[0]?.c ?? 0),
        },
        occurrenceHistory,
        deliveryEvents,
      },
    };
  } catch {
    return { ok: false, errorCode: "reminder_pipeline_metrics_failed" };
  }
}

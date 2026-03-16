/**
 * Domain handling for integrator webhook events (POST /api/integrator/events).
 * Parsed body shape per contracts/integrator-events-body.json.
 */
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export type IntegratorEventBody = {
  eventType: string;
  eventId?: string;
  occurredAt?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
};

export type IntegratorHandleResult = {
  accepted: boolean;
  reason?: string;
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

export async function handleIntegratorEvent(event: IntegratorEventBody): Promise<IntegratorHandleResult> {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.info("[integrator] event received", event.eventType, event.eventId ?? "");
  }

  if (event.eventType === "diary.symptom.tracking.created") {
    const payload = event.payload ?? {};
    const userId = payload.userId;
    if (!isNonEmptyString(userId)) {
      return { accepted: false, reason: "diary.symptom.tracking.created: payload.userId required" };
    }
    const symptomTitle = payload.symptomTitle;
    if (!isNonEmptyString(symptomTitle)) {
      return { accepted: false, reason: "diary.symptom.tracking.created: payload.symptomTitle required" };
    }
    try {
      const deps = buildAppDeps();
      await deps.diaries.createSymptomTracking({
        userId,
        symptomKey: typeof payload.symptomKey === "string" ? payload.symptomKey : null,
        symptomTitle: symptomTitle.trim(),
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `diary.symptom.tracking.created: ${reason}` };
    }
  }

  if (event.eventType === "diary.lfk.complex.created") {
    const payload = event.payload ?? {};
    const userId = payload.userId;
    if (!isNonEmptyString(userId)) {
      return { accepted: false, reason: "diary.lfk.complex.created: payload.userId required" };
    }
    const title = payload.title;
    if (!isNonEmptyString(title)) {
      return { accepted: false, reason: "diary.lfk.complex.created: payload.title required" };
    }
    try {
      const deps = buildAppDeps();
      await deps.diaries.createLfkComplex({
        userId,
        title: (title as string).trim(),
        origin: payload.origin === "assigned_by_specialist" ? "assigned_by_specialist" : "manual",
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `diary.lfk.complex.created: ${reason}` };
    }
  }

  if (event.eventType === "diary.lfk.session.created") {
    const payload = event.payload ?? {};
    const userId = payload.userId;
    if (!isNonEmptyString(userId)) {
      return { accepted: false, reason: "diary.lfk.session.created: payload.userId required" };
    }
    const complexId = payload.complexId;
    if (!isNonEmptyString(complexId)) {
      return { accepted: false, reason: "diary.lfk.session.created: payload.complexId required" };
    }
    const completedAt = payload.completedAt;
    const completedAtStr = typeof completedAt === "string" ? completedAt : new Date().toISOString();
    try {
      const deps = buildAppDeps();
      await deps.diaries.addLfkSession({
        userId,
        complexId,
        completedAt: completedAtStr,
        source: "bot",
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `diary.lfk.session.created: ${reason}` };
    }
  }

  if (event.eventType === "diary.symptom.entry.created") {
    const payload = event.payload ?? {};
    const userId = payload.userId;
    if (!isNonEmptyString(userId)) {
      return { accepted: false, reason: "diary.symptom.entry.created: payload.userId required" };
    }
    const trackingId = payload.trackingId;
    if (!isNonEmptyString(trackingId)) {
      return { accepted: false, reason: "diary.symptom.entry.created: payload.trackingId required" };
    }
    const value0_10 = payload.value0_10 ?? payload.value_0_10;
    const num = typeof value0_10 === "number" ? value0_10 : Number(value0_10);
    if (Number.isNaN(num) || num < 0 || num > 10) {
      return { accepted: false, reason: "diary.symptom.entry.created: payload.value0_10 must be 0..10" };
    }
    const entryType = payload.entryType === "daily" ? "daily" : "instant";
    const recordedAt = payload.recordedAt;
    const recordedAtStr = typeof recordedAt === "string" ? recordedAt : new Date().toISOString();
    try {
      const deps = buildAppDeps();
      await deps.diaries.addSymptomEntry({
        userId,
        trackingId,
        value0_10: Math.round(num),
        entryType,
        recordedAt: recordedAtStr,
        source: "bot",
        notes: typeof payload.notes === "string" ? payload.notes : null,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `diary.symptom.entry.created: ${reason}` };
    }
  }

  return {
    accepted: false,
    reason: "durable ingest is not implemented",
  };
}

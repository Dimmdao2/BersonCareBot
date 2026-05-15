import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { upsertOpenConflictLog, writeAuditLog, computeConflictKeyFromCandidateIds } from "@/app-layer/admin/auditLog";
import { integratorAutoMergeAnomalyDedupKey } from "@/modules/admin-incidents/adminIncidentAlertConfig";
import { sendAdminIncidentRelayAlert } from "@/modules/admin-incidents/sendAdminIncidentAlerts";
import { getPool } from "@/app-layer/db/client";
import { computeIntegratorEventsRequestHash } from "@/app-layer/idempotency/integratorEventSemanticHash";
import { handleIntegratorEvent } from "@/modules/integrator/events";
import { resolveCanonicalUserId } from "@/app-layer/platform-user/canonicalPlatformUser";
import { getCachedResponse, isKeyValid, setCachedResponse } from "@/app-layer/idempotency/idempotencyStore";
import { verifyIntegratorSignature } from "@/app-layer/integrator/verifyIntegratorSignature";

function eventBodyFromParsed(parsed: Record<string, unknown>): {
  eventType: string;
  eventId?: string;
  occurredAt?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
} | null {
  if (typeof parsed.eventType !== "string" || parsed.eventType.trim() === "") return null;
  return {
    eventType: parsed.eventType,
    eventId: typeof parsed.eventId === "string" ? parsed.eventId : undefined,
    occurredAt: typeof parsed.occurredAt === "string" ? parsed.occurredAt : undefined,
    idempotencyKey: typeof parsed.idempotencyKey === "string" ? parsed.idempotencyKey : undefined,
    payload: typeof parsed.payload === "object" && parsed.payload !== null ? (parsed.payload as Record<string, unknown>) : undefined,
  };
}

export async function POST(request: Request) {
  const timestamp = request.headers.get("x-bersoncare-timestamp");
  const signature = request.headers.get("x-bersoncare-signature");
  const idempotencyKey = request.headers.get("x-bersoncare-idempotency-key");
  const rawBody = await request.text();

  if (!timestamp || !signature || !idempotencyKey) {
    return NextResponse.json({ ok: false, error: "missing webhook headers" }, { status: 400 });
  }
  if (!isKeyValid(idempotencyKey)) {
    return NextResponse.json({ ok: false, error: "invalid idempotency key" }, { status: 400 });
  }

  if (!verifyIntegratorSignature(timestamp, rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body: eventType required" }, { status: 400 });
  }

  const eventBody = eventBodyFromParsed(parsed);
  if (!eventBody) {
    return NextResponse.json({ ok: false, error: "invalid body: eventType required" }, { status: 400 });
  }
  if (eventBody.idempotencyKey && eventBody.idempotencyKey !== idempotencyKey) {
    return NextResponse.json({ ok: false, error: "idempotency key mismatch between header and body" }, { status: 400 });
  }

  const requestHash = computeIntegratorEventsRequestHash(parsed);
  const cached = await getCachedResponse(idempotencyKey, requestHash);
  if (cached.hit && "mismatch" in cached && cached.mismatch) {
    return NextResponse.json({ ok: false, error: "idempotency key reused with different payload" }, { status: 409 });
  }
  if (cached.hit && "status" in cached) {
    return NextResponse.json(cached.body, { status: cached.status });
  }

  const deps = buildAppDeps();
  const pool = getPool();
  const result = await handleIntegratorEvent(eventBody, {
    conflictAudit: {
      logAutoMergeConflict: async (input) => {
        if (input.candidateIds.length === 0) {
          await writeAuditLog(pool, {
            actorId: null,
            action: "auto_merge_conflict_anomaly",
            details: {
              eventType: input.eventType,
              reason: input.reason,
              integratorUserIds: input.integratorUserIds,
              payloadPreview: input.payloadPreview,
              conflictClass: input.conflictClass,
            },
            status: "error",
          });
          void sendAdminIncidentRelayAlert({
            topic: "auto_merge_conflict_anomaly",
            dedupKey: integratorAutoMergeAnomalyDedupKey({
              eventType: input.eventType,
              reason: input.reason,
              conflictClass: input.conflictClass,
              integratorUserIds: input.integratorUserIds,
            }),
            lines: [
              "auto_merge_conflict_anomaly",
              `eventType=${input.eventType}`,
              `reason=${String(input.reason)}`,
              `conflictClass=${String(input.conflictClass)}`,
            ],
          }).catch(() => {});
          return;
        }
        const up = await upsertOpenConflictLog(pool, {
          actorId: null,
          candidateIds: input.candidateIds,
          targetId: input.candidateIds[0] ?? null,
          details: {
            eventType: input.eventType,
            reason: input.reason,
            integratorUserIds: input.integratorUserIds,
            payloadPreview: input.payloadPreview,
            conflictClass: input.conflictClass,
          },
          status: "error",
        });
        if (up.kind === "conflict" && up.insertedFirst) {
          try {
            const conflictKey = computeConflictKeyFromCandidateIds(input.candidateIds);
            void sendAdminIncidentRelayAlert({
              topic: "auto_merge_conflict",
              dedupKey: conflictKey,
              lines: [
                "auto_merge_conflict (integrator projection)",
                `eventType=${input.eventType}`,
                `candidateIds=${input.candidateIds.join(",")}`,
                `reason=${String(input.reason)}`,
              ],
            }).catch(() => {});
          } catch {
            /* ignore */
          }
        }
      },
    },
    diaries: deps.diaries,
    users: {
      ...deps.userProjection,
      findByPhone: async (phoneNormalized: string) => {
        const found = await deps.userByPhone.findByPhone(phoneNormalized);
        return found ? { platformUserId: found.userId } : null;
      },
      resolveCanonicalPlatformUserId: async (platformUserId: string) => {
        const resolved = await resolveCanonicalUserId(pool, platformUserId);
        return resolved ?? platformUserId;
      },
    },
    preferences: deps.userProjection,
    supportCommunication: deps.supportCommunication,
    reminderProjection: deps.reminderProjection,
    appointmentProjection: deps.appointmentProjection,
    patientBooking: deps.patientBooking,
    branches: deps.branches,
    subscriptionMailingProjection: deps.subscriptionMailingProjection,
  });
  const status = result.accepted ? 202 : result.retryable === false ? 422 : 503;
  const body: Record<string, unknown> = result.accepted
    ? { ok: true, accepted: true, idempotencyKey }
    : { ok: false, accepted: false, error: result.reason, idempotencyKey };

  // Only cache successful acceptance so projection worker retries can re-run the handler after transient 503
  if (result.accepted) {
    const stored = await setCachedResponse(idempotencyKey, requestHash, status, body);
    if (!stored) {
      const again = await getCachedResponse(idempotencyKey, requestHash);
      if (again.hit && "mismatch" in again && again.mismatch) {
        return NextResponse.json({ ok: false, error: "idempotency key reused with different payload" }, { status: 409 });
      }
      if (again.hit && "status" in again) {
        return NextResponse.json(again.body, { status: again.status });
      }
    }
  }
  return NextResponse.json(body, { status });
}

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { handleIntegratorEvent } from "@/modules/integrator/events";
import { getCachedResponse, isKeyValid, setCachedResponse } from "@/infra/idempotency/store";
import { verifyIntegratorSignature } from "@/infra/webhooks/verifyIntegratorSignature";

function parseEventsBody(
  raw: string,
): {
  eventType: string;
  eventId?: string;
  occurredAt?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
} | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.eventType !== "string" || parsed.eventType.trim() === "") return null;
    return {
      eventType: parsed.eventType as string,
      eventId: typeof parsed.eventId === "string" ? parsed.eventId : undefined,
      occurredAt: typeof parsed.occurredAt === "string" ? parsed.occurredAt : undefined,
      idempotencyKey: typeof parsed.idempotencyKey === "string" ? parsed.idempotencyKey : undefined,
      payload: typeof parsed.payload === "object" && parsed.payload !== null ? (parsed.payload as Record<string, unknown>) : undefined,
    };
  } catch {
    return null;
  }
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

  const requestHash = createHash("sha256").update(rawBody).digest("hex");
  const cached = await getCachedResponse(idempotencyKey, requestHash);
  if (cached.hit && "mismatch" in cached && cached.mismatch) {
    return NextResponse.json({ ok: false, error: "idempotency key reused with different payload" }, { status: 409 });
  }
  if (cached.hit && "status" in cached) {
    return NextResponse.json(cached.body, { status: cached.status });
  }

  const eventBody = parseEventsBody(rawBody);
  if (!eventBody) {
    return NextResponse.json({ ok: false, error: "invalid body: eventType required" }, { status: 400 });
  }
  if (eventBody.idempotencyKey && eventBody.idempotencyKey !== idempotencyKey) {
    return NextResponse.json({ ok: false, error: "idempotency key mismatch between header and body" }, { status: 400 });
  }

  const result = await handleIntegratorEvent(eventBody);
  const status = result.accepted ? 202 : 503;
  const body: Record<string, unknown> = result.accepted
    ? { ok: true, accepted: true, idempotencyKey }
    : { ok: false, accepted: false, error: result.reason, idempotencyKey };
  await setCachedResponse(idempotencyKey, requestHash, status, body);
  return NextResponse.json(body, { status });
}

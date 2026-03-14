import { NextResponse } from "next/server";
import { handleIntegratorEvent } from "@/modules/integrator/events";
import { getCachedResponse, isKeyValid, setCachedResponse } from "@/infra/idempotency/store";
import { verifyIntegratorSignature } from "@/infra/webhooks/verifyIntegratorSignature";

function parseEventsBody(raw: string): { eventType: string; eventId?: string; occurredAt?: string; payload?: Record<string, unknown> } | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.eventType !== "string" || parsed.eventType.trim() === "") return null;
    return {
      eventType: parsed.eventType as string,
      eventId: typeof parsed.eventId === "string" ? parsed.eventId : undefined,
      occurredAt: typeof parsed.occurredAt === "string" ? parsed.occurredAt : undefined,
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

  const cached = getCachedResponse(idempotencyKey);
  if (cached !== null) {
    return NextResponse.json(cached as Record<string, unknown>);
  }

  const eventBody = parseEventsBody(rawBody);
  if (!eventBody) {
    return NextResponse.json({ ok: false, error: "invalid body: eventType required" }, { status: 400 });
  }
  handleIntegratorEvent(eventBody);

  const body = { ok: true, accepted: true, idempotencyKey };
  setCachedResponse(idempotencyKey, body);
  return NextResponse.json(body);
}

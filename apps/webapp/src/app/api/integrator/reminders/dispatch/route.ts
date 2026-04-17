import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { handleReminderDispatch } from "@/modules/integrator/reminderDispatch";
import { validateReminderDispatchPayload } from "@/modules/reminders/service";
import { getCachedResponse, isKeyValid, setCachedResponse } from "@/app-layer/idempotency/idempotencyStore";
import { verifyIntegratorSignature } from "@/app-layer/integrator/verifyIntegratorSignature";

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

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }
  if (!validateReminderDispatchPayload(payload)) {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }

  const dispatchBody = payload as { userId: string; message: { title: string; body: string }; channelBindings?: Record<string, string>; actions?: Array<{ id: string; label: string }> };
  if (typeof (payload as { idempotencyKey?: unknown }).idempotencyKey === "string" && (payload as { idempotencyKey: string }).idempotencyKey !== idempotencyKey) {
    return NextResponse.json({ ok: false, error: "idempotency key mismatch between header and body" }, { status: 400 });
  }

  const result = await handleReminderDispatch({
    idempotencyKey,
    userId: dispatchBody.userId,
    message: dispatchBody.message,
    channelBindings: dispatchBody.channelBindings,
    actions: dispatchBody.actions,
  });

  const status = result.accepted ? 202 : 503;
  const body: Record<string, unknown> = result.accepted
    ? { ok: true, accepted: true, dispatchMode: "bridge-to-integrator" }
    : { ok: false, accepted: false, error: result.reason, dispatchMode: "bridge-to-integrator" };
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
  return NextResponse.json(body, { status });
}

import { NextResponse } from "next/server";
import { getCachedResponse, isKeyValid, setCachedResponse } from "@/infra/idempotency/store";
import { verifyIntegratorSignature } from "@/infra/webhooks/verifyIntegratorSignature";

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

  const body = { ok: true, accepted: true, idempotencyKey };
  setCachedResponse(idempotencyKey, body);
  return NextResponse.json(body);
}

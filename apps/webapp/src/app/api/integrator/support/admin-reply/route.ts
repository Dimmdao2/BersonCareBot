import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyIntegratorSignature } from "@/infra/webhooks/verifyIntegratorSignature";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCachedResponse, isKeyValid, setCachedResponse } from "@/app-layer/idempotency/idempotencyStore";
import { integratorSupportAdminReplySchema } from "@/modules/messaging/integratorSupportHttp";

/**
 * POST /api/integrator/support/admin-reply — M2M: ответ врача из TG/Max admin_reply → webapp-thread + пациент.
 */
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

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = integratorSupportAdminReplySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.integratorSupportBridge) {
    return NextResponse.json({ ok: false, error: "support not configured" }, { status: 503 });
  }

  const result = await deps.integratorSupportBridge.applyAdminReply(parsed.data);
  if (!result.ok) {
    const status =
      result.error === "empty" || result.error === "not_webapp_conversation" ? 400 : 404;
    const body = { ok: false, error: result.error };
    await setCachedResponse(idempotencyKey, requestHash, status, body);
    return NextResponse.json(body, { status });
  }

  const okBody = { ok: true };
  await setCachedResponse(idempotencyKey, requestHash, 200, okBody);
  return NextResponse.json(okBody);
}

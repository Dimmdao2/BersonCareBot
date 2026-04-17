import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/app-layer/db/client";
import { computeMessengerPhoneBindRequestHash } from "@/app-layer/idempotency/messengerPhoneBindRequestHash";
import { getCachedResponse, isKeyValid, setCachedResponse } from "@/app-layer/idempotency/idempotencyStore";
import { logger } from "@/app-layer/logging/logger";
import { verifyIntegratorSignature } from "@/app-layer/integrator/verifyIntegratorSignature";
import { executeMessengerPhoneHttpBind } from "@/modules/integrator/messengerPhoneHttpBindExecute";

const bodySchema = z.object({
  channelCode: z.enum(["telegram", "max"]),
  externalId: z.string().min(1).max(128),
  phoneNormalized: z.string().min(1).max(32),
  correlationId: z.string().max(256).optional(),
  idempotencyKey: z.string().max(256).optional(),
});

/**
 * Optional M2M: signed POST for an **external** caller (not the unified-DB hot path used by the bot).
 * Same TX semantics as integrator `user.phone.link` — see `executeMessengerPhoneHttpBind`.
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
    logger.warn({ route: "integrator/messenger-phone/bind" }, "invalid integrator signature");
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const validated = bodySchema.safeParse(parsed);
  if (!validated.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  if (validated.data.idempotencyKey && validated.data.idempotencyKey !== idempotencyKey) {
    return NextResponse.json({ ok: false, error: "idempotency key mismatch between header and body" }, { status: 400 });
  }

  const requestHash = computeMessengerPhoneBindRequestHash(parsed);
  const cached = await getCachedResponse(idempotencyKey, requestHash);
  if (cached.hit && "mismatch" in cached && cached.mismatch) {
    return NextResponse.json({ ok: false, error: "idempotency key reused with different payload" }, { status: 409 });
  }
  if (cached.hit && "status" in cached) {
    return NextResponse.json(cached.body, { status: cached.status });
  }

  const pool = getPool();
  const result = await executeMessengerPhoneHttpBind(pool, {
    channelCode: validated.data.channelCode,
    externalId: validated.data.externalId,
    phoneNormalized: validated.data.phoneNormalized,
    correlationId: validated.data.correlationId,
  });

  if (result.ok) {
    const body: Record<string, unknown> = {
      ok: true,
      platformUserId: result.platformUserId,
      idempotencyKey,
    };
    const status = 200;
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

  const failBody: Record<string, unknown> = {
    ok: false,
    reason: result.reason,
    idempotencyKey,
  };
  if (result.phoneLinkIndeterminate) {
    failBody.indeterminate = true;
  }

  const status = result.reason === "db_transient_failure" ? 503 : 422;
  return NextResponse.json(failBody, { status });
}

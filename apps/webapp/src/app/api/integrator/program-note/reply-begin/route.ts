import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyIntegratorSignature } from "@/infra/webhooks/verifyIntegratorSignature";
import { getCachedResponse, isKeyValid, setCachedResponse } from "@/app-layer/idempotency/idempotencyStore";
import { resolveProgramNoteReplyContext } from "@/modules/messaging/programNoteReplyContext";

const bodySchema = z.object({
  stageItemId: z.string().uuid(),
});

/**
 * POST /api/integrator/program-note/reply-begin — M2M: начало ответа врача на наблюдение пациента по упражнению.
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

  const parsed = bodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const ctx = await resolveProgramNoteReplyContext(parsed.data.stageItemId);
  if (!ctx) {
    const body = { ok: false, error: "stage_item_not_found" };
    await setCachedResponse(idempotencyKey, requestHash, 404, body);
    return NextResponse.json(body, { status: 404 });
  }

  const okBody = {
    ok: true,
    platformUserId: ctx.platformUserId,
    exerciseTitle: ctx.exerciseTitle,
    integratorConversationId: ctx.integratorConversationId,
    programNoteReplyState: ctx.programNoteReplyState,
  };
  await setCachedResponse(idempotencyKey, requestHash, 200, okBody);
  return NextResponse.json(okBody);
}

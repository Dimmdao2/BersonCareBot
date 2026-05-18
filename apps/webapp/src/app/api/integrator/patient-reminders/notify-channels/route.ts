import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyIntegratorSignature } from "@/infra/webhooks/verifyIntegratorSignature";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCachedResponse, isKeyValid, setCachedResponse } from "@/app-layer/idempotency/idempotencyStore";
import {
  integratorPatientReminderNotifyBodySchema,
  runPatientReminderIntegratorNotify,
} from "@/modules/patient-reminders/integratorNotifyChannels";

/**
 * POST /api/integrator/patient-reminders/notify-channels — M2M fan-out напоминания в Web Push и email (webapp).
 * Подпись: как у POST /api/integrator/events (`timestamp.body`).
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

  const parsed = integratorPatientReminderNotifyBodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const result = await runPatientReminderIntegratorNotify(parsed.data, {
      findPlatformUserByIntegratorId: async (integratorUserId) => {
        const row = await deps.userProjection.findByIntegratorId(integratorUserId);
        return row ? { platformUserId: row.platformUserId } : null;
      },
      channelPreferences: deps.channelPreferencesPort,
      topicChannelPrefs: deps.topicChannelPrefs,
      webPushSubscriptions: deps.webPushSubscriptions,
      systemSettings: deps.systemSettings,
      getProfileEmailFields: deps.userProjection.getProfileEmailFields,
      readReminderNotifyGate: deps.readReminderNotifyGate,
      reminderTransactionalEmailCooldown: deps.reminderTransactionalEmailCooldown,
      getChannelBindings: deps.loadPlatformUserChannelBindings,
    });

    const status = 200;
    await setCachedResponse(idempotencyKey, requestHash, status, result);
    return NextResponse.json(result, { status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

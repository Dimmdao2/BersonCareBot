import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyIntegratorSignature } from '@/app-layer/integrator/verifyIntegratorSignature';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  getCachedResponse,
  isKeyValid,
  setCachedResponse,
} from '@/app-layer/idempotency/idempotencyStore';
import {
  integratorPatientWebPushNotifyBodySchema,
  runPatientWebPushNotify,
} from '@/modules/patient-notifications/patientWebPushNotify';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';

/**
 * POST /api/integrator/patient-notifications/web-push — M2M Web Push (запись на приём, рассылки и т.д.).
 */
export async function POST(request: Request) {
  const timestamp = request.headers.get('x-bersoncare-timestamp');
  const signature = request.headers.get('x-bersoncare-signature');
  const idempotencyKey = request.headers.get('x-bersoncare-idempotency-key');
  const rawBody = await request.text();

  if (!timestamp || !signature || !idempotencyKey) {
    return NextResponse.json({ ok: false, error: 'missing webhook headers' }, { status: 400 });
  }
  if (!isKeyValid(idempotencyKey)) {
    return NextResponse.json({ ok: false, error: 'invalid idempotency key' }, { status: 400 });
  }
  if (!verifyIntegratorSignature(timestamp, rawBody, signature, request)) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const parsed = integratorPatientWebPushNotifyBodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }
  if (
    !parsed.data.organizationId ||
    !enterVerifiedIntegratorOrganizationPrincipal(
      parsed.data.organizationId,
      'integrator-patient-web-push-notify',
    )
  ) {
    return NextResponse.json(
      { ok: false, error: 'valid organizationId required' },
      { status: 400 },
    );
  }
  if (!parsed.data.platformUserId && !parsed.data.phoneNormalized) {
    return NextResponse.json({ ok: false, error: 'missing_user_ref' }, { status: 400 });
  }

  const requestHash = createHash('sha256').update(rawBody).digest('hex');
  const cached = await getCachedResponse(idempotencyKey, requestHash);
  if (cached.hit && 'mismatch' in cached && cached.mismatch) {
    return NextResponse.json(
      { ok: false, error: 'idempotency key reused with different payload' },
      { status: 409 },
    );
  }
  if (cached.hit && 'status' in cached) {
    return NextResponse.json(cached.body, { status: cached.status });
  }

  const deps = buildAppDeps();
  try {
    if (!deps.patientOrganization) {
      return NextResponse.json(
        { ok: false, error: 'patient organization service unavailable' },
        { status: 503 },
      );
    }
    const platformUser = parsed.data.platformUserId
      ? { platformUserId: parsed.data.platformUserId }
      : parsed.data.phoneNormalized
        ? await deps.userProjection.findByPhoneNormalized(parsed.data.phoneNormalized)
        : null;
    if (
      platformUser &&
      !(await deps.patientOrganization.hasActiveEnrollment(
        platformUser.platformUserId,
        parsed.data.organizationId,
      ))
    ) {
      return NextResponse.json(
        { ok: false, error: 'notification target is outside organization' },
        { status: 403 },
      );
    }
    const result = await runPatientWebPushNotify(parsed.data, {
      findPlatformUserByPhone: async (phoneNormalized) => {
        const row =
          phoneNormalized === parsed.data.phoneNormalized
            ? platformUser
            : await deps.userProjection.findByPhoneNormalized(phoneNormalized);
        return row ? { platformUserId: row.platformUserId } : null;
      },
      channelPreferences: deps.channelPreferencesPort,
      topicChannelPrefs: deps.topicChannelPrefs,
      webPushSubscriptions: deps.webPushSubscriptions,
      systemSettings: deps.systemSettings,
      readReminderNotifyGate: deps.readReminderNotifyGate,
      recordDeliveryAttempt: (input) =>
        deps.notificationDelivery.recordNotificationDeliveryAttempt(input),
      patientInboundChatPort: deps.supportCommunication,
    });

    const status = 200;
    await setCachedResponse(idempotencyKey, requestHash, status, result);
    return NextResponse.json(result, { status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

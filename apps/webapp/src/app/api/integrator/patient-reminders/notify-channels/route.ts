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
  integratorPatientReminderNotifyBodySchema,
  runPatientReminderIntegratorNotify,
} from '@/modules/patient-reminders/integratorNotifyChannels';
import { createLoadWarmupPushContext } from '@/modules/web-push/createLoadWarmupPushContext';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';
import { canMaterializeMechanicOnRead } from '@/app-layer/entitlements/readMaterializationGate';

/**
 * POST /api/integrator/patient-reminders/notify-channels — M2M fan-out напоминания в Web Push и email (webapp).
 * Подпись: как у POST /api/integrator/events (`timestamp.body`).
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

  const parsed = integratorPatientReminderNotifyBodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }
  if (
    !enterVerifiedIntegratorOrganizationPrincipal(
      parsed.data.organizationId,
      'integrator-patient-reminder-notify',
    )
  ) {
    return NextResponse.json(
      { ok: false, error: 'valid organizationId required' },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  if (!deps.patientOrganization) {
    return NextResponse.json(
      { ok: false, error: 'patient organization service unavailable' },
      { status: 503 },
    );
  }
  const platformUser = await deps.userProjection.findByIntegratorId(parsed.data.integratorUserId);
  if (
    platformUser &&
    !(await deps.patientOrganization.hasActiveEnrollment(
      platformUser.platformUserId,
      parsed.data.organizationId,
    ))
  ) {
    return NextResponse.json(
      { ok: false, error: 'integrator user is outside organization' },
      { status: 403 },
    );
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

  const loadWarmupPushContext = createLoadWarmupPushContext(deps, {
    canMaterializePresentation: () =>
      canMaterializeMechanicOnRead(parsed.data.organizationId, 'warmups'),
  });
  try {
    const result = await runPatientReminderIntegratorNotify(parsed.data, {
      findPlatformUserByIntegratorId: async (integratorUserId) => {
        const row =
          integratorUserId === parsed.data.integratorUserId
            ? platformUser
            : await deps.userProjection.findByIntegratorId(integratorUserId);
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
      recordDeliveryAttempt: (input) =>
        deps.notificationDelivery.recordNotificationDeliveryAttempt(input),
      loadWarmupPushContext,
    });

    const status = 200;
    await setCachedResponse(idempotencyKey, requestHash, status, result);
    return NextResponse.json(result, { status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyIntegratorSignature } from '@/app-layer/integrator/verifyIntegratorSignature';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';
import {
  getCachedResponse,
  isKeyValid,
  setCachedResponse,
} from '@/app-layer/idempotency/idempotencyStore';
import { appointmentReminderMaterializationBodySchema } from '@/modules/booking-notifications/appointmentReminderMaterializationSchema';
import { prepareAppointmentReminderDeliveries } from '@/modules/booking-notifications/appointmentReminderMaterialization';
import { DeliveryTargetsTenantDeniedError } from '@/modules/integrator/deliveryTargetsApi';

export async function POST(request: Request) {
  const timestamp = request.headers.get('x-bersoncare-timestamp');
  const signature = request.headers.get('x-bersoncare-signature');
  const idempotencyKey = request.headers.get('x-bersoncare-idempotency-key');
  const rawBody = await request.text();
  if (!timestamp || !signature || !idempotencyKey || !isKeyValid(idempotencyKey)) {
    return NextResponse.json({ ok: false, error: 'invalid webhook headers' }, { status: 400 });
  }
  if (!verifyIntegratorSignature(timestamp, rawBody, signature, request)) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const parsed = appointmentReminderMaterializationBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }
  if (
    !enterVerifiedIntegratorOrganizationPrincipal(
      parsed.data.organizationId,
      'integrator-appointment-reminder-materialization',
    )
  ) {
    return NextResponse.json({ ok: false, error: 'valid organizationId required' }, { status: 400 });
  }
  const requestHash = createHash('sha256').update(rawBody).digest('hex');
  const cached = await getCachedResponse(idempotencyKey, requestHash);
  if (cached.hit && 'mismatch' in cached && cached.mismatch) {
    return NextResponse.json({ ok: false, error: 'idempotency mismatch' }, { status: 409 });
  }
  if (cached.hit && 'status' in cached) return NextResponse.json(cached.body, { status: cached.status });

  const deps = buildAppDeps();
  let targets: Awaited<ReturnType<typeof deps.deliveryTargetsApi.getTargets>> = null;
  try {
    targets = await deps.deliveryTargetsApi.getTargets({
      organizationId: parsed.data.organizationId,
      ...(parsed.data.platformUserId
        ? { platformUserId: parsed.data.platformUserId }
        : parsed.data.phoneNormalized
          ? { phone: parsed.data.phoneNormalized }
          : {}),
      topic: 'appointment_reminders',
    });
  } catch (error) {
    if (!(error instanceof DeliveryTargetsTenantDeniedError)) throw error;
    if (parsed.data.platformUserId) {
      return NextResponse.json(
        { ok: false, error: 'notification target is outside organization' },
        { status: 403 },
      );
    }
    // A phone belonging to a person outside this clinic is simply not an audience for the
    // clinic appointment. Never reveal the cross-tenant match and never retry it as a 500.
    targets = null;
  }
  let skipped: 'no_platform_user' | 'no_audience' | undefined;
  let deliveries: ReturnType<typeof prepareAppointmentReminderDeliveries> = [];
  if (!targets) {
    skipped = parsed.data.platformUserId ? 'no_audience' : 'no_platform_user';
  } else {
    const selectedChannels = targets.resolution?.selectedChannels ?? [];
    const timeZone = await deps.appDisplayTimeZone();
    deliveries = prepareAppointmentReminderDeliveries(
      {
        organizationId: parsed.data.organizationId,
        appointmentId: parsed.data.appointmentId,
        bookingId: parsed.data.bookingId,
        platformUserId: targets.platformUserId,
        slotStartIso: parsed.data.slotStartIso,
        generationRevision: parsed.data.generationRevision,
        patientName: parsed.data.patientName ?? null,
        reminderPlan: parsed.data.reminderPlan,
        cancelPending: parsed.data.cancelPending,
      },
      {
        selectedChannels,
        ...(targets.channelBindings.telegramId
          ? { telegramId: targets.channelBindings.telegramId }
          : {}),
        ...(targets.channelBindings.maxId ? { maxId: targets.channelBindings.maxId } : {}),
        hasWebPush: selectedChannels.includes('web_push'),
      },
      new Date().toISOString(),
      timeZone,
    );
  }
  const result = await deps.appointmentReminderMaterialization.replaceGeneration({
    organizationId: parsed.data.organizationId,
    appointmentId: parsed.data.appointmentId,
    generationStartAt: parsed.data.slotStartIso,
    deliveries,
    reason: parsed.data.cancelPending ? 'appointment_cancelled' : 'appointment_generation_replaced',
  });
  const response = { ok: true, ...result, ...(skipped ? { skipped } : {}) };
  await setCachedResponse(idempotencyKey, requestHash, 200, response);
  return NextResponse.json(response);
}

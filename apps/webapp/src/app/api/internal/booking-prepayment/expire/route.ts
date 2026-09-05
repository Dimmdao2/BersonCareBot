import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_BOOKING_PREPAYMENT_EXPIRY_JOB_KEY,
  OPERATOR_MAINTENANCE_JOB_FAMILY,
} from '@/modules/operator-health/reconcileJobKeys';

/**
 * PAY-APPT-11: истечение неоплаченной предоплаты записи.
 *
 * Второго планировщика здесь не заводится: это обычная строка ЕДИНОГО typed manifest фоновых
 * заданий (`backgroundJobManifest.ts`), из которого генерируются и host-расписание, и строка в
 * «Здоровье системы». Тик машинный, поэтому и принципал машинный (класс `service`, роль
 * `app_worker`), как у всех остальных внутренних тиков вебаппа.
 *
 * Отбор «у кого истёк срок» межарендный и живёт ВНУТРИ объявленного корня
 * `app.expire_due_booking_prepayments`: здесь нет ни одного собственного запроса «по всем
 * записям», а гонку с оплатой, пришедшей ровно на границе срока, закрывает сам корень.
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;
  enterWithDbInfraPrincipal({ source: 'api/internal/booking-prepayment/expire:POST' });

  const url = new URL(request.url);
  const limit = Math.min(
    500,
    Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '100', 10) || 100),
  );

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  try {
    const payments = buildAppDeps().payments;
    if (!payments) {
      return NextResponse.json({ ok: false, error: 'payments_unavailable' }, { status: 503 });
    }
    const result = await payments.expireDueBookingPrepayments({ limit });
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MAINTENANCE_JOB_FAMILY,
      jobKey: OPERATOR_BOOKING_PREPAYMENT_EXPIRY_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: true,
      metaJson: { expired: result.expired },
    });
    return NextResponse.json({ ok: true, expired: result.expired });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MAINTENANCE_JOB_FAMILY,
      jobKey: OPERATOR_BOOKING_PREPAYMENT_EXPIRY_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: msg,
    });
    logger.error({ err: e }, '[internal/booking-prepayment/expire] failed');
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}

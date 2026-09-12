import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { requireResolvedSurface } from '@/shared/lib/surface/requestSurface';
import type { BookingPaymentStatusOk } from '@/shared/lib/paymentStatusView';

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({
    returnPath: routePaths.patientBooking,
  });
  if (!gate.ok) return gate.response;

  const bookingId = new URL(request.url).searchParams.get('bookingId')?.trim();
  if (!bookingId) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const patientOrigin = requireResolvedSurface(request.headers).publicOrigin;
  // Принципал здесь НЕ переустанавливается: сессия пациента уже стоит в контексте, и она
  // организационно-привязанная. Обёртка `withPatientIdentityPrincipal` (личность без организации)
  // была бы шагом назад: рантайм-правило `portContextRuntime.ts` пускает пациентский контекст без
  // организации только для корней отношения и трёх корней из явного списка, а этот корень читает
  // данные ВНУТРИ клиники. Живая проверка на DEV это и показала: «Patient port context requires an
  // organization-scoped patient principal».
  const result = await deps.patientBooking.getBookingPaymentStatus(bookingId, patientOrigin);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  }
  // Форма ответа объявлена ОДИН раз и читается обоими экранами оплаты: сужение этого тела обязано
  // быть ошибкой компиляции у потребителей, а не молчаливым «провайдер не настроен» (аудит S9, F1).
  const body: BookingPaymentStatusOk = {
    intentId: result.intentId,
    amountMinor: result.amountMinor,
    currency: result.currency,
    intentStatus: result.intentStatus,
    checkoutUrl: result.checkoutUrl,
    paymentDeadlineAt: result.paymentDeadlineAt,
    appointmentStatus: result.appointmentStatus,
  };
  return NextResponse.json({ ok: true, ...body });
}

/**
 * GET /api/doctor/schedule/nearest-free-window
 *
 * Возвращает ближайшее свободное окно сегодня для врача.
 * Используется заглушкой правой панели таба «Записи».
 *
 * Query params:
 *   specialistId? — UUID специалиста
 *   branchId?     — UUID филиала
 *   roomId?       — UUID кабинета
 *   timeZone?     — IANA таймзона (по умолчанию Europe/Moscow)
 *
 * Ответ: { ok: true, window: { from: ISO, to: ISO } | null }
 * Деградирует gracefully: если расчёт невозможен — window: null (не 500).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger, serializeError } from '@/infra/logging/logger';
import { resolveDoctorCalendarIana } from '@/app-layer/booking/resolveDoctorCalendarIana';
import { requireDoctorBookingEngine } from '../../booking-engine/_requireDoctorBookingEngine';
import {
  parseDoctorScheduleScopeQuery,
  resolveDoctorScheduleScope,
} from '../../booking-engine/_resolveDoctorScheduleScope';

const QuerySchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  roomId: z.string().uuid().optional().nullable(),
  timeZone: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const raw = {
    branchId: url.searchParams.get('branchId') ?? undefined,
    roomId: url.searchParams.get('roomId') ?? undefined,
    timeZone: url.searchParams.get('timeZone') ?? undefined,
  };

  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_params', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const scopeInput = parseDoctorScheduleScopeQuery(url.searchParams);
  if (!scopeInput.ok) {
    return NextResponse.json({ ok: false, error: scopeInput.error }, { status: 400 });
  }
  const scheduleScope = await resolveDoctorScheduleScope(gate.ctx, scopeInput.value);
  if (!scheduleScope.ok) {
    const status = scheduleScope.error === 'schedule_specialist_not_available' ? 404 : 409;
    return NextResponse.json({ ok: false, error: scheduleScope.error }, { status });
  }

  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    // Деградация: сервис недоступен — возвращаем null окно (не блокировать UI)
    return NextResponse.json({ ok: true, window: null, resolvedScope: scheduleScope.value });
  }

  // Таймзона: явный параметр (от клиента, уже разрешённый) → doctor TZ chain → дефолт
  let timeZone: string;
  if (parsed.data.timeZone) {
    timeZone = parsed.data.timeZone;
  } else {
    timeZone = await resolveDoctorCalendarIana(gate.ctx.session.user.userId).catch(
      () => 'Europe/Moscow',
    );
  }

  try {
    const window = await deps.bookingScheduling.nearestFreeWindow({
      organizationId: gate.ctx.organizationId,
      specialistId: scheduleScope.value.specialistId,
      branchId: parsed.data.branchId ?? null,
      roomId: parsed.data.roomId ?? null,
      timeZone,
    });
    return NextResponse.json({ ok: true, window, resolvedScope: scheduleScope.value });
  } catch (e) {
    logger.error(
      { err: serializeError(e), organizationId: gate.ctx.organizationId },
      'nearest-free-window.failed',
    );
    // Деградация: ошибка → null окно (не блокировать UI)
    return NextResponse.json({ ok: true, window: null, resolvedScope: scheduleScope.value });
  }
}

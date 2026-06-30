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
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger, serializeError } from "@/infra/logging/logger";
import { resolveDoctorCalendarIana } from "@/app-layer/booking/resolveDoctorCalendarIana";
import { requireDoctorBookingEngine } from "../../booking-engine/_requireDoctorBookingEngine";

const QuerySchema = z.object({
  specialistId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  roomId: z.string().uuid().optional().nullable(),
  timeZone: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const raw = {
    specialistId: url.searchParams.get("specialistId") ?? undefined,
    branchId: url.searchParams.get("branchId") ?? undefined,
    roomId: url.searchParams.get("roomId") ?? undefined,
    timeZone: url.searchParams.get("timeZone") ?? undefined,
  };

  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_params", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    // Деградация: сервис недоступен — возвращаем null окно (не блокировать UI)
    return NextResponse.json({ ok: true, window: null });
  }

  // Таймзона: явный параметр (от клиента, уже разрешённый) → doctor TZ chain → дефолт
  let timeZone: string;
  if (parsed.data.timeZone) {
    timeZone = parsed.data.timeZone;
  } else {
    timeZone = await resolveDoctorCalendarIana(gate.ctx.session.user.userId).catch(
      () => "Europe/Moscow",
    );
  }

  try {
    const window = await deps.bookingScheduling.nearestFreeWindow({
      organizationId: gate.ctx.organizationId,
      specialistId: parsed.data.specialistId ?? null,
      branchId: parsed.data.branchId ?? null,
      roomId: parsed.data.roomId ?? null,
      timeZone,
    });
    return NextResponse.json({ ok: true, window });
  } catch (e) {
    logger.error(
      { err: serializeError(e), organizationId: gate.ctx.organizationId },
      "nearest-free-window.failed",
    );
    // Деградация: ошибка → null окно (не блокировать UI)
    return NextResponse.json({ ok: true, window: null });
  }
}

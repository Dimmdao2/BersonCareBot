/**
 * Пояс сотрудника: только чтение и запись значения, определённого устройством.
 * Ручной настройки (PATCH) нет намеренно — §34 канона владельца
 * (`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`): «часовой пояс не настраивается у человека — ни у
 * пациента, ни у специалиста, ни у админа. Определяется устройством при входе».
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getDoctorAccountTimezone,
  syncDoctorAccountTimezoneFromDevice,
} from '@/app-layer/doctor/accountTimezone';
import { requireDoctorApiSession } from '@/app-layer/guards/requireRole';

const postBodySchema = z.object({
  /** IANA из браузера (`Intl`); сохранённый пояс приводится к ней. */
  browserCalendarIana: z.string().max(120).optional(),
});

export async function GET() {
  const guard = await requireDoctorApiSession();
  if (!guard.ok) return guard.response;

  const timezone = await getDoctorAccountTimezone(guard.session.user.userId);
  return NextResponse.json({ ok: true, timezone });
}

export async function POST(request: Request) {
  const guard = await requireDoctorApiSession();
  if (!guard.ok) return guard.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const tz = parsed.data.browserCalendarIana?.trim();
  await syncDoctorAccountTimezoneFromDevice(
    guard.session.user.userId,
    tz && tz.length > 0 ? tz : null,
  );
  return NextResponse.json({ ok: true });
}

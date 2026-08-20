/**
 * Пояс человека определяется УСТРОЙСТВОМ и не настраивается руками — §34 канона владельца
 * (`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`). Поэтому здесь только чтение (GET) и запись значения,
 * которое сообщил браузер (POST): и при первом входе, и когда человек переехал.
 * Двери «поставить произвольный пояс пациенту» (PATCH) нет намеренно: она и была тем контролом,
 * который §34 снимает.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';

const postBodySchema = z.object({
  /** IANA из браузера (`Intl`); сохранённый пояс приводится к ней. */
  browserCalendarIana: z.string().max(120).optional(),
});

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.profile });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const calendarTimezone = await deps.patientCalendarTimezone.getIanaForUser(
    gate.session.user.userId,
  );
  return NextResponse.json({ ok: true, calendarTimezone });
}

/** Приведение сохранённого пояса к поясу устройства при заходе в приложение (§34). */
export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.profile });
  if (!gate.ok) return gate.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const tz = parsed.data.browserCalendarIana?.trim();
  const deps = buildAppDeps();
  await deps.patientCalendarTimezone.syncFromDevice(
    gate.session.user.userId,
    tz && tz.length > 0 ? tz : null,
  );
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { routePaths } from '@/app-layer/routes/paths';

function parseMinutesBody(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const m = Math.trunc(raw);
  if (m !== raw) return null;
  if (m < 1 || m > 720) return null;
  return m;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientReminders });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const { id: occurrenceId } = await context.params;
  if (!occurrenceId?.trim()) {
    return NextResponse.json({ ok: false, error: 'validation_error' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'validation_error' }, { status: 400 });
  }

  const minutes = parseMinutesBody(body.minutes);
  if (minutes === null) {
    return NextResponse.json({ ok: false, error: 'validation_error' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const res = await deps.reminders.snoozeOccurrence(session.user.userId, occurrenceId, minutes);
  if (!res.ok) {
    if (res.error === 'not_available') {
      return NextResponse.json({ ok: false, error: res.error }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: res.error }, { status: 404 });
  }
  revalidatePath(routePaths.patientReminders);
  revalidatePath(routePaths.patient);
  return NextResponse.json({
    ok: true,
    occurrenceId: res.data.occurrenceId,
    snoozedUntil: res.data.snoozedUntil,
  });
}

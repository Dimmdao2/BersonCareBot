/**
 * GET /api/doctor/patients/[userId]/exercise-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 * → { ok: true, days: [{ date: "YYYY-MM-DD", completedCount: number }] }
 *
 * Exercise-completion calendar for the «Обзор» tab of the Patient card.
 * Defaults to the first..last day of the current calendar month when from/to
 * are absent. Aggregates completions per local calendar date from three sources:
 *  1. lfk_sessions — personal LFK diary sessions (manual complexes in bot/app)
 *  2. patient_practice_completions (non-warmup) — standalone content-page completions
 *  3. program_action_log (done) — treatment program exercise completions (main source)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  currentPatientExerciseCalendarMonthRange,
  loadDoctorPatientExerciseCalendar,
} from '@/app/app/doctor/patients/loadDoctorPatientExerciseCalendar';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const rawFrom = url.searchParams.get('from');
  const rawTo = url.searchParams.get('to');

  let fromDate: string;
  let toDate: string;

  if (rawFrom || rawTo) {
    const fromResult = dateSchema.safeParse(rawFrom);
    const toResult = dateSchema.safeParse(rawTo);
    if (!fromResult.success || !toResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: 'invalid_date_params',
          detail: 'expected from=YYYY-MM-DD&to=YYYY-MM-DD',
        },
        { status: 400 },
      );
    }
    fromDate = fromResult.data;
    toDate = toResult.data;
  } else {
    fromDate = currentPatientExerciseCalendarMonthRange().from;
    toDate = currentPatientExerciseCalendarMonthRange().to;
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const days = await loadDoctorPatientExerciseCalendar(deps, gate.ctx, identity.userId, {
    from: fromDate,
    to: toDate,
  });

  return NextResponse.json({ ok: true, days });
}

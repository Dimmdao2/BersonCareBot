/**
 * GET /api/doctor/patients/[userId]/exercise-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 * → { ok: true, iana, from, to, days: [{ date: "YYYY-MM-DD", completedCount: number }] }
 *
 * Exercise-completion calendar for the «Обзор» tab of the Patient card.
 * Defaults to the first..last day of the current calendar month when from/to
 * are absent. Aggregates completions per local calendar date from three sources:
 *  1. lfk_sessions — personal LFK diary sessions (manual complexes in bot/app)
 *  2. patient_practice_completions (non-warmup) — standalone content-page completions
 *  3. program_action_log (done) — treatment program exercise completions (main source)
 * Optional instanceId + stageItemId restrict the result to one assigned exercise;
 * instanceId + stageId restricts it to all items of one program stage.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  currentPatientExerciseCalendarMonthRangeInIana,
  loadDoctorPatientExerciseCalendar,
} from '@/app/app/doctor/patients/loadDoctorPatientExerciseCalendar';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const uuidSchema = z.string().uuid();

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
  const rawInstanceId = url.searchParams.get('instanceId');
  const rawStageItemId = url.searchParams.get('stageItemId');
  const rawStageId = url.searchParams.get('stageId');

  let fromDate: string | undefined;
  let toDate: string | undefined;

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
  }

  const exerciseFilterResult = z
    .object({ instanceId: uuidSchema, stageItemId: uuidSchema })
    .safeParse({ instanceId: rawInstanceId, stageItemId: rawStageItemId });
  const stageFilterResult = z
    .object({ instanceId: uuidSchema, stageId: uuidSchema })
    .safeParse({ instanceId: rawInstanceId, stageId: rawStageId });
  if (
    (rawInstanceId || rawStageItemId || rawStageId) &&
    !exerciseFilterResult.success &&
    !stageFilterResult.success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_exercise_filter' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  let exerciseFilter:
    | { instanceId: string; stageItemId: string }
    | { instanceId: string; stageItemIds: string[] }
    | undefined;
  if (exerciseFilterResult.success) {
    exerciseFilter = exerciseFilterResult.data;
  } else if (stageFilterResult.success) {
    const instance = await deps.treatmentProgramInstance.getInstanceById(
      stageFilterResult.data.instanceId,
    );
    if (
      !instance ||
      instance.organizationId !== gate.ctx.organizationId ||
      instance.patientUserId !== identity.userId
    ) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const stage = instance.stages.find((row) => row.id === stageFilterResult.data.stageId);
    if (!stage) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    exerciseFilter = {
      instanceId: stageFilterResult.data.instanceId,
      stageItemIds: stage.items.map((item) => item.id),
    };
  }

  const patientIana = (await deps.patientCalendarTimezone.getIanaForUser(identity.userId)) ?? 'UTC';
  if (!fromDate || !toDate) {
    const current = currentPatientExerciseCalendarMonthRangeInIana(patientIana);
    fromDate = current.from;
    toDate = current.to;
  }

  const snapshot = await loadDoctorPatientExerciseCalendar(
    deps,
    gate.ctx,
    identity.userId,
    {
      from: fromDate,
      to: toDate,
    },
    exerciseFilter,
  );

  return NextResponse.json({ ok: true, ...snapshot });
}

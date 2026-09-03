/**
 * GET /api/doctor/comments/exercise-metrics
 *
 * График статистики выполнения конкретного упражнения.
 *
 * Query params:
 *   instanceId     — UUID экземпляра программы
 *   stageItemId    — UUID элемента этапа (`instance_stage_item_id`)
 *   windowDays     — 7 | 30, если не передан календарный диапазон
 *   from, to       — календарный диапазон YYYY-MM-DD в зоне пациента
 *
 * Возвращает массив точек `ExerciseMetricPoint[]` (reps, weightKg, sets, difficulty)
 * за выбранный период. Только записи `action_type = done`.
 */
import { DateTime } from 'luxon';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { resolveDoctorInstanceInWorkspace } from '@/app/api/doctor/treatment-program-instances/_doctorInstanceWorkspace';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z
  .object({
    instanceId: z.string().uuid(),
    stageItemId: z.string().uuid(),
    windowDays: z
      .enum(['7', '30'])
      .optional()
      .transform((v) => (v == null ? undefined : v === '30' ? 30 : 7) as 7 | 30 | undefined),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .refine((value) => Boolean(value.from) === Boolean(value.to), {
    message: 'from_and_to_must_be_provided_together',
  });

export async function GET(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    instanceId: searchParams.get('instanceId'),
    stageItemId: searchParams.get('stageItemId'),
    windowDays: searchParams.get('windowDays') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const { instanceId, stageItemId, windowDays, from, to } = parsed.data;

  try {
    const deps = buildAppDeps();
    const resolved = await resolveDoctorInstanceInWorkspace(deps, gate.ctx, instanceId);
    if (!resolved.ok) return resolved.response;

    const itemBelongsToInstance = resolved.instance.stages.some((stage) =>
      stage.items.some((item) => item.id === stageItemId),
    );
    if (!itemBelongsToInstance) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    const explicitWindow =
      from && to
        ? await (async () => {
            const patientIana =
              (await deps.patientCalendarTimezone.getIanaForUser(
                resolved.instance.patientUserId,
              )) ?? 'UTC';
            const start = DateTime.fromISO(from, { zone: patientIana }).startOf('day');
            const end = DateTime.fromISO(to, { zone: patientIana })
              .plus({ days: 1 })
              .startOf('day');
            if (!start.isValid || !end.isValid) return null;
            return {
              windowStartUtcIso: start.toUTC().toISO()!,
              windowEndUtcExclusiveIso: end.toUTC().toISO()!,
            };
          })()
        : null;
    if (from && to && !explicitWindow) {
      return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
    }

    const points = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgramProgress.listExerciseMetricsForWindow({
        instanceId,
        instanceStageItemId: stageItemId,
        ...(explicitWindow ?? { windowDays: windowDays ?? 7 }),
      }),
    );
    return NextResponse.json({ ok: true, points });
  } catch {
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

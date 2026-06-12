/**
 * GET /api/doctor/comments/exercise-metrics
 *
 * Микро-график статистики выполнения упражнения за последнюю неделю (Этап B.3).
 *
 * Query params:
 *   instanceId     — UUID экземпляра программы
 *   stageItemId    — UUID элемента этапа (`instance_stage_item_id`)
 *
 * Возвращает массив точек `ExerciseMetricPoint[]` (reps, weightKg, sets, difficulty)
 * за последние 7 дней (UTC). Только записи `action_type = done`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const querySchema = z.object({
  instanceId: z.string().uuid(),
  stageItemId: z.string().uuid(),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    instanceId: searchParams.get("instanceId"),
    stageItemId: searchParams.get("stageItemId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const { instanceId, stageItemId } = parsed.data;

  try {
    const deps = buildAppDeps();
    const points = await deps.treatmentProgramProgress.listExerciseMetricsForWeek({
      instanceId,
      instanceStageItemId: stageItemId,
    });
    return NextResponse.json({ ok: true, points });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

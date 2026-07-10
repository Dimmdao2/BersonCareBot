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
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { resolveDoctorInstanceInWorkspace } from "@/app/api/doctor/treatment-program-instances/_doctorInstanceWorkspace";

const querySchema = z.object({
  instanceId: z.string().uuid(),
  stageItemId: z.string().uuid(),
  windowDays: z
    .enum(["7", "30"])
    .optional()
    .transform((v) => (v === "30" ? 30 : 7) as 7 | 30),
});

export async function GET(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    instanceId: searchParams.get("instanceId"),
    stageItemId: searchParams.get("stageItemId"),
    windowDays: searchParams.get("windowDays") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const { instanceId, stageItemId, windowDays } = parsed.data;

  try {
    const deps = buildAppDeps();
    const resolved = await resolveDoctorInstanceInWorkspace(deps, gate.ctx, instanceId);
    if (!resolved.ok) return resolved.response;

    const itemBelongsToInstance = resolved.instance.stages.some((stage) =>
      stage.items.some((item) => item.id === stageItemId),
    );
    if (!itemBelongsToInstance) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const points = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgramProgress.listExerciseMetricsForWindow({
        instanceId,
        instanceStageItemId: stageItemId,
        windowDays,
      }),
    );
    return NextResponse.json({ ok: true, points });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

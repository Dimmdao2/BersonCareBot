import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const metricsBodySchema = z
  .object({
    perceivedDifficulty: z.enum(["easy", "medium", "hard"]).optional(),
    reps: z.number().int().positive().max(5000).optional(),
    sets: z.number().int().positive().max(500).optional(),
    weightKg: z.number().min(0).max(500).optional(),
  })
  .strict();

function validateIds(instanceId: string, itemId: string): boolean {
  return z.string().uuid().safeParse(instanceId).success && z.string().uuid().safeParse(itemId).success;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId, itemId } = await context.params;
  if (!validateIds(instanceId, itemId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const metrics = await deps.treatmentProgramProgress.getLatestSimpleCompletionMetrics({
    patientUserId: gate.session.user.userId,
    instanceId,
    stageItemId: itemId,
  });
  return NextResponse.json({ ok: true, metrics });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId, itemId } = await context.params;
  if (!validateIds(instanceId, itemId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = metricsBodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    await deps.treatmentProgramProgress.updateLatestSimpleCompletionMetrics({
      patientUserId: gate.session.user.userId,
      instanceId,
      stageItemId: itemId,
      completion: parsed.data,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 404 });
  }
}

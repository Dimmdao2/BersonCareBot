import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const bodySchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]),
  note: z.string().max(4000).optional().nullable(),
  /** Подмножество `exerciseId` из снимка; если не передано — отмечаются все упражнения назначения. */
  completedExerciseIds: z.array(z.string().uuid()).optional().nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId, itemId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(itemId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const json = (await request.json()) as unknown;
    body = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const doneItemIds = await deps.treatmentProgramPatientActions.patientSubmitLfkPostSession({
      patientUserId: gate.session.user.userId,
      instanceId,
      stageItemId: itemId,
      difficulty: body.difficulty,
      note: body.note ?? null,
      completedExerciseIds: body.completedExerciseIds ?? null,
    });
    return NextResponse.json({ ok: true, doneItemIds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("не найден") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

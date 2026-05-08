import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";

/** Значения совпадают с тремя иконками на экране разминки (не произвольный 1–5). */
const bodySchema = z.object({
  feeling: z.union([z.literal(1), z.literal(3), z.literal(5)]),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { id: completionId } = await context.params;
  if (!completionId || !z.string().uuid().safeParse(completionId).success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const feeling = parsed.data.feeling;
  const userId = gate.session.user.userId;

  const deps = buildAppDeps();

  const completion = await deps.patientPractice.getCompletionByIdForUser(completionId, userId);
  if (!completion) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (completion.source !== "daily_warmup") {
    return NextResponse.json({ ok: false, error: "not_daily_warmup" }, { status: 403 });
  }

  if (completion.feeling !== null) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const items = await deps.references.listActiveItemsByCategoryCode("symptom_type");
  const warmupRef = items.find((i) => i.code === "warmup_feeling");
  if (!warmupRef) {
    return NextResponse.json({ ok: false, error: "warmup_feeling_reference_missing" }, { status: 500 });
  }

  const result = await deps.warmupFeelingCompletion.applyDailyWarmupFeeling({
    userId,
    completionId,
    feeling,
    completedAtIso: completion.completedAt,
    symptomTypeRefId: warmupRef.id,
    symptomTitle: warmupRef.title,
  });

  revalidatePath(routePaths.patient);
  return NextResponse.json(result.duplicate ? { ok: true, duplicate: true } : { ok: true });
}

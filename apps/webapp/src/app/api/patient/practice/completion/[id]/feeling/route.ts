import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { patientPracticeCompletions, symptomEntries } from "../../../../../../../../db/schema";

function pgErrCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e && typeof (e as { code?: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  if (typeof e === "object" && e !== null && "cause" in e) {
    return pgErrCode((e as { cause?: unknown }).cause);
  }
  return undefined;
}

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

  const db = getDrizzle();
  let duplicate = false;

  try {
    await db.transaction(async (tx) => {
      const trackingId = await deps.diaries.upsertWarmupFeelingTrackingIdInTx(tx, {
        userId,
        symptomTitle: warmupRef.title,
        symptomTypeRefId: warmupRef.id,
      });

      const existing = await tx
        .select({ id: symptomEntries.id })
        .from(symptomEntries)
        .where(eq(symptomEntries.patientPracticeCompletionId, completionId))
        .limit(1);
      if (existing.length > 0) {
        await tx
          .update(patientPracticeCompletions)
          .set({ feeling })
          .where(
            and(
              eq(patientPracticeCompletions.id, completionId),
              eq(patientPracticeCompletions.userId, userId),
              isNull(patientPracticeCompletions.feeling),
            ),
          );
        duplicate = true;
        return;
      }

      await tx.insert(symptomEntries).values({
        userId,
        platformUserId: userId,
        trackingId,
        value010: feeling,
        entryType: "instant",
        recordedAt: completion.completedAt,
        source: "webapp",
        notes: null,
        patientPracticeCompletionId: completionId,
      });

      await tx
        .update(patientPracticeCompletions)
        .set({ feeling })
        .where(and(eq(patientPracticeCompletions.id, completionId), eq(patientPracticeCompletions.userId, userId)));
    });
  } catch (e: unknown) {
    const code = pgErrCode(e);
    if (code === "23505") {
      duplicate = true;
    } else {
      throw e;
    }
  }

  if (duplicate) {
    const again = await deps.patientPractice.getCompletionByIdForUser(completionId, userId);
    if (again && again.feeling === null) {
      await deps.patientPractice.updateCompletionFeelingById(completionId, userId, feeling);
    }
    revalidatePath(routePaths.patient);
    return NextResponse.json({ ok: true, duplicate: true });
  }

  revalidatePath(routePaths.patient);
  return NextResponse.json({ ok: true });
}

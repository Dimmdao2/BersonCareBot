import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiSessionWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";

const answerSchema = z.object({
  questionId: z.enum(["q1", "q2", "q3", "q4", "q5"]),
  value: z.string().min(1),
});

const bodySchema = z.object({
  answers: z.array(answerSchema).min(1),
});

export async function POST(request: Request) {
  const gate = await requirePatientApiSessionWithPhone({ returnPath: routePaths.intakeNutrition });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const service = getOnlineIntakeService();
  try {
    const result = await service.submitNutrition({
      userId: session.user.userId,
      patientName: session.user.displayName ?? "",
      patientPhone: session.user.phone ?? "",
      answers: parsed.data.answers,
    });
    return NextResponse.json(
      { id: result.id, type: result.type, status: result.status, createdAt: result.createdAt },
      { status: 201 },
    );
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err) {
      if ((err as { code: string }).code === "VALIDATION_ERROR") {
        return NextResponse.json({ error: "VALIDATION_ERROR", message: err.message }, { status: 400 });
      }
      if ((err as { code: string }).code === "RATE_LIMIT") {
        return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429 });
      }
    }
    throw err;
  }
}

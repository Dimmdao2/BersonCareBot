import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const bodySchema = z.object({
  testId: z.string().uuid(),
  rawValue: z.record(z.string(), z.unknown()),
  normalizedDecision: z.enum(["passed", "failed", "partial"]).optional(),
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

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const item = await deps.treatmentProgramProgress.patientSubmitTestResult({
      patientUserId: gate.session.user.userId,
      instanceId,
      stageItemId: itemId,
      testId: parsed.data.testId,
      rawValue: parsed.data.rawValue,
      normalizedDecision: parsed.data.normalizedDecision,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("не найден") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

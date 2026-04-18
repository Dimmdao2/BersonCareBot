import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const bodySchema = z.object({
  orderedItemIds: z.array(z.string().uuid()).min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ instanceId: string; stageId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { instanceId, stageId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(stageId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const inst = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    const identity = await deps.doctorClientsPort.getClientIdentity(inst.patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    await deps.treatmentProgramInstance.doctorReorderStageItems({
      instanceId,
      stageId,
      actorId: session.user.userId,
      orderedItemIds: parsed.data.orderedItemIds,
    });
    const next = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    return NextResponse.json({ ok: true, instance: next });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("не найден") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

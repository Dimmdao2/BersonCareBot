import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const patchBodySchema = z
  .object({
    title: z.string().min(1).max(2000).optional(),
    status: z.enum(["active", "completed"]).optional(),
  })
  .refine((b) => b.title !== undefined || b.status !== undefined, { message: "empty_patch" });

export async function GET(
  _request: Request,
  context: { params: Promise<{ instanceId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const item = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    const identity = await deps.doctorClientsPort.getClientIdentity(item.patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ instanceId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const item = await deps.treatmentProgramInstance.updateInstance({
      instanceId,
      title: parsed.data.title,
      status: parsed.data.status,
      actorId: session.user.userId,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("не найден") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

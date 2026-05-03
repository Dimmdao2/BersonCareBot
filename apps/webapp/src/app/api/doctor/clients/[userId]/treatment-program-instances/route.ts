import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { revalidatePatientTreatmentProgramUi } from "@/app-layer/cache/revalidatePatientTreatmentProgramUi";
import { SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE } from "@/modules/treatment-program/instance-service";

const postBodySchema = z.object({
  templateId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentity(userId);
  if (!identity) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const items = await deps.treatmentProgramInstance.listForPatient(userId);
  return NextResponse.json({ ok: true, items });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentity(userId);
  if (!identity) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    const item = await deps.treatmentProgramInstance.assignTemplateToPatient({
      templateId: parsed.data.templateId,
      patientUserId: userId,
      assignedBy: session.user.userId,
    });
    revalidatePatientTreatmentProgramUi();
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg === SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

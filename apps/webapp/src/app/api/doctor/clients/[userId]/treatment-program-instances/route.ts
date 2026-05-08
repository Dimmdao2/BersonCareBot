import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { revalidatePatientTreatmentProgramUi } from "@/app-layer/cache/revalidatePatientTreatmentProgramUi";
import { SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE } from "@/modules/treatment-program/instance-service";

const postBodySchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === "object" && raw !== null && !("kind" in raw) && "templateId" in raw) {
      const t = (raw as { templateId?: unknown }).templateId;
      if (typeof t === "string" && z.string().uuid().safeParse(t).success) {
        return { kind: "from_template" as const, templateId: t };
      }
    }
    return raw;
  },
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("from_template"), templateId: z.string().uuid() }),
    z.object({
      kind: z.literal("blank"),
      title: z.string().min(1).max(2000).optional(),
    }),
  ]),
);

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
  const [identity, items] = await Promise.all([
    deps.doctorClientsPort.getClientIdentity(userId),
    deps.treatmentProgramInstance.listForPatient(userId),
  ]);
  if (!identity) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

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
    const item =
      parsed.data.kind === "from_template"
        ? await deps.treatmentProgramInstance.assignTemplateToPatient({
            templateId: parsed.data.templateId,
            patientUserId: userId,
            assignedBy: session.user.userId,
          })
        : await deps.treatmentProgramInstance.createBlankIndividualPlan({
            patientUserId: userId,
            assignedBy: session.user.userId,
            title: parsed.data.title,
          });
    revalidatePatientTreatmentProgramUi();
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg === SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

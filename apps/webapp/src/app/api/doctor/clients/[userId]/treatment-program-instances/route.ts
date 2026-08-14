import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { revalidatePatientTreatmentProgramUi } from '@/app-layer/cache/revalidatePatientTreatmentProgramUi';
import { SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE } from '@/modules/treatment-program/instance-service';

const postBodySchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === 'object' && raw !== null && !('kind' in raw) && 'templateId' in raw) {
      const t = (raw as { templateId?: unknown }).templateId;
      if (typeof t === 'string' && z.string().uuid().safeParse(t).success) {
        return { kind: 'from_template' as const, templateId: t };
      }
    }
    return raw;
  },
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('from_template'), templateId: z.string().uuid() }),
    z.object({
      kind: z.literal('blank'),
      title: z.string().min(1).max(2000).optional(),
    }),
  ]),
);

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const items = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.treatmentProgramInstance.listForPatientClinicalView(identity.userId),
  );

  return NextResponse.json({ ok: true, items });
}

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  try {
    const item = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      parsed.data.kind === 'from_template'
        ? deps.treatmentProgramInstance.assignTemplateToPatient({
            organizationId: gate.ctx.organizationId,
            templateId: parsed.data.templateId,
            patientUserId: identity.userId,
            assignedBy: session.user.userId,
            assignmentSource: 'doctor',
          })
        : deps.treatmentProgramInstance.createBlankIndividualPlan({
            patientUserId: identity.userId,
            assignedBy: session.user.userId,
            title: parsed.data.title,
          }),
    );
    revalidatePatientTreatmentProgramUi();
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    const status = msg === SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

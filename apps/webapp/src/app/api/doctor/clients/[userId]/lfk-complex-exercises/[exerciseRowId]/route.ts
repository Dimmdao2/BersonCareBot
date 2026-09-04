import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const bodySchema = z.object({
  localComment: z.union([z.string().max(5000), z.null()]),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ userId: string; exerciseRowId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId: patientUserId, exerciseRowId } = await ctx.params;
  if (
    !z.string().uuid().safeParse(patientUserId).success ||
    !z.string().uuid().safeParse(exerciseRowId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_params' }, { status: 400 });
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    patientUserId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  try {
    await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.diaries.updateLfkComplexExerciseLocalCommentForUser({
        userId: identity.userId,
        rowId: exerciseRowId,
        localComment: parsed.data.localComment,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondWithSafeApiError(
      'api/doctor/clients/[userId]/lfk-complex-exercises/[exerciseRowId]',
      e,
      {
        fallbackCode: 'clients_lfk_complex_exercises_failed',
        fallbackStatus: 500,
        domainStatus: (text) => (text.includes('не найден') ? 404 : 400),
      },
    );
  }
}

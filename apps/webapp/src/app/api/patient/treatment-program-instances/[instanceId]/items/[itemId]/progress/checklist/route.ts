import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const bodySchema = z.object({
  checked: z.boolean(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId, itemId } = await context.params;
  if (
    !z.string().uuid().safeParse(instanceId).success ||
    !z.string().uuid().safeParse(itemId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const json = (await request.json()) as unknown;
    body = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const doneItemIds = await deps.treatmentProgramPatientActions.patientToggleChecklistItem({
      patientUserId: gate.session.user.userId,
      instanceId,
      stageItemId: itemId,
      checked: body.checked,
    });
    return NextResponse.json({ ok: true, doneItemIds });
  } catch (e) {
    return respondWithSafeApiError(
      'api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/checklist',
      e,
      {
        fallbackCode: 'progress_checklist_failed',
        fallbackStatus: 500,
        domainStatus: (text) => (text.includes('не найден') ? 404 : 400),
      },
    );
  }
}

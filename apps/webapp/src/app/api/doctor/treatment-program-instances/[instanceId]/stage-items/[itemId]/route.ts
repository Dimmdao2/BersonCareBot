import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { TREATMENT_PROGRAM_ITEM_TYPES } from '@/modules/treatment-program/types';
import { revalidatePatientTreatmentProgramUi } from '@/app-layer/cache/revalidatePatientTreatmentProgramUi';
import { doctorTreatmentProgramInstanceRouteErrorStatus } from '@/modules/treatment-program/doctorInstanceRouteErrorStatus';

const deleteBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

const patchBodySchema = z
  .object({
    localComment: z.union([z.string().max(20000), z.null()]).optional(),
    replace: z
      .object({
        itemType: z.enum(TREATMENT_PROGRAM_ITEM_TYPES),
        itemRefId: z.string().uuid(),
      })
      .optional(),
    status: z.enum(['active', 'disabled']).optional(),
    isActionable: z.boolean().optional(),
    groupId: z.string().uuid().nullable().optional(),
    loadSettings: z
      .object({
        reps: z.union([z.number(), z.null()]),
        sets: z.union([z.number(), z.null()]),
        maxPain: z.union([z.number(), z.null()]),
        weightKg: z.union([z.number().min(0).max(500), z.null()]).optional(),
      })
      .optional(),
  })
  .refine(
    (b) =>
      b.localComment !== undefined ||
      b.replace !== undefined ||
      b.status !== undefined ||
      b.isActionable !== undefined ||
      b.groupId !== undefined ||
      b.loadSettings !== undefined,
    { message: 'empty_patch' },
  );

export async function PATCH(
  request: Request,
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const { instanceId, itemId } = await context.params;
  if (
    !z.string().uuid().safeParse(instanceId).success ||
    !z.string().uuid().safeParse(itemId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const inst0 = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    if (!inst0 || inst0.organizationId !== gate.ctx.organizationId) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const identity = await deps.doctorClientsPort.getClientIdentity(inst0.patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    if (parsed.data.replace) {
      const replacement = parsed.data.replace;
      const row = await withDoctorWorkspacePrincipal(gate.ctx, () =>
        deps.treatmentProgramInstance.doctorReplaceStageItem({
          instanceId,
          itemId,
          actorId: session.user.userId,
          itemType: replacement.itemType,
          itemRefId: replacement.itemRefId,
        }),
      );
      revalidatePatientTreatmentProgramUi();
      return NextResponse.json({ ok: true, item: row });
    }

    if (parsed.data.status !== undefined) {
      const row =
        parsed.data.status === 'disabled'
          ? await withDoctorWorkspacePrincipal(gate.ctx, () =>
              deps.treatmentProgramInstance.doctorDisableInstanceStageItem({
                instanceId,
                itemId,
                actorId: session.user.userId,
              }),
            )
          : await withDoctorWorkspacePrincipal(gate.ctx, () =>
              deps.treatmentProgramInstance.doctorEnableInstanceStageItem({
                instanceId,
                itemId,
                actorId: session.user.userId,
              }),
            );
      revalidatePatientTreatmentProgramUi();
      return NextResponse.json({ ok: true, item: row });
    }

    if (parsed.data.isActionable !== undefined) {
      const isActionable = parsed.data.isActionable;
      const row = await withDoctorWorkspacePrincipal(gate.ctx, () =>
        deps.treatmentProgramInstance.doctorSetInstanceStageItemIsActionable({
          instanceId,
          itemId,
          actorId: session.user.userId,
          isActionable,
        }),
      );
      revalidatePatientTreatmentProgramUi();
      return NextResponse.json({ ok: true, item: row });
    }

    if (parsed.data.groupId !== undefined) {
      const groupId = parsed.data.groupId;
      const row = await withDoctorWorkspacePrincipal(gate.ctx, () =>
        deps.treatmentProgramInstance.doctorSetInstanceStageItemGroup({
          instanceId,
          itemId,
          actorId: session.user.userId,
          groupId,
        }),
      );
      revalidatePatientTreatmentProgramUi();
      return NextResponse.json({ ok: true, item: row });
    }

    if (parsed.data.loadSettings !== undefined) {
      const loadSettings = parsed.data.loadSettings;
      const row = await withDoctorWorkspacePrincipal(gate.ctx, () =>
        deps.treatmentProgramInstance.doctorMergeInstanceStageItemLoadSettings({
          instanceId,
          itemId,
          actorId: session.user.userId,
          reps: loadSettings.reps,
          sets: loadSettings.sets,
          maxPain: loadSettings.maxPain,
          weightKg: loadSettings.weightKg,
        }),
      );
      revalidatePatientTreatmentProgramUi();
      return NextResponse.json({ ok: true, item: row });
    }

    const row = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgramInstance.updateStageItemLocalComment({
        instanceId,
        stageItemId: itemId,
        localComment: parsed.data.localComment!,
        actorId: session.user.userId,
      }),
    );
    revalidatePatientTreatmentProgramUi();
    return NextResponse.json({ ok: true, item: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    const status = doctorTreatmentProgramInstanceRouteErrorStatus(msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const { instanceId, itemId } = await context.params;
  if (
    !z.string().uuid().safeParse(instanceId).success ||
    !z.string().uuid().safeParse(itemId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => ({}))) as unknown;
  const parsedBody = deleteBodySchema.safeParse(raw);
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const reason = parsedBody.data.reason;

  const deps = buildAppDeps();
  try {
    const inst0 = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    if (!inst0 || inst0.organizationId !== gate.ctx.organizationId) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const identity = await deps.doctorClientsPort.getClientIdentity(inst0.patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgramInstance.doctorDeleteInstanceStageItem({
        instanceId,
        itemId,
        actorId: session.user.userId,
        reason: reason ?? null,
      }),
    );
    revalidatePatientTreatmentProgramUi();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    const status = doctorTreatmentProgramInstanceRouteErrorStatus(msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

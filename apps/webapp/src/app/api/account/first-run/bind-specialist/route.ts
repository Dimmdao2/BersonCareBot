import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireAdminWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { getCurrentSession } from '@/modules/auth/service';
import {
  FIO_LATIN_REJECTED_MESSAGE,
  FIO_LATIN_REJECTED_TEXT,
  isCyrillicFioInput,
  isFioLatinRejection,
} from '@/shared/lib/fio';
import {
  hasLaunchCapability,
  resolveLaunchCapabilities,
} from '@/app-layer/guards/workspaceCapabilities';

const FioSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine(isCyrillicFioInput, { message: FIO_LATIN_REJECTED_MESSAGE }),
  })
  .strict();

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (
    session &&
    hasLaunchCapability(
      resolveLaunchCapabilities({ sessionRole: session.user.role }),
      'platform.operations',
    )
  ) {
    return NextResponse.json({ ok: false, error: 'platform_admin_forbidden' }, { status: 403 });
  }
  const gate = await requireAdminWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  if (ctx.membershipRole !== 'owner') {
    return NextResponse.json({ ok: false, error: 'owner_required' }, { status: 403 });
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = FioSchema.safeParse(
    raw === null ? { fullName: ctx.session.user.displayName } : raw,
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: isFioLatinRejection(parsed) ? 'fio_latin_rejected' : 'invalid_input',
        ...(isFioLatinRejection(parsed) ? { message: FIO_LATIN_REJECTED_TEXT } : {}),
      },
      { status: 400 },
    );
  }
  const deps = buildAppDeps();
  const specialistId = await deps.organizationProvisioning.ensureOwnBookableSpecialist({
    organizationId: ctx.organizationId,
    membershipId: ctx.membershipId,
    platformUserId: ctx.session.user.userId,
    membershipRole: ctx.membershipRole,
    specialistId: ctx.specialistId,
    displayName: parsed.data.fullName,
  });
  if (!specialistId) {
    return NextResponse.json({ ok: false, error: 'specialist_binding_failed' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, specialistId, redirectTo: '/app/doctor' });
}

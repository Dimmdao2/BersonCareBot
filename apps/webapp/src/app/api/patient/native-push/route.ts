import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { isNativePushProvider } from '@/modules/web-push/nativePush';

const registration = z.object({
  installationId: z.string().min(8).max(512),
  token: z.string().min(8).max(8192),
  provider: z.enum(['rustore', 'fcm', 'hms']),
});

function services() {
  const deps = buildAppDeps();
  if (!deps.nativePushTargets) throw new Error('native_push_unavailable');
  return { targets: deps.nativePushTargets, settings: deps.systemSettings };
}

/** Patient route fixes Therapy Go; the client cannot select a surface. */
export async function GET() {
  const gate = await requirePatientApiBusinessAccess();
  if (!gate.ok) return gate.response;
  const { targets, settings } = services();
  const [status, projectId] = await Promise.all([
    targets.status(gate.session.user.userId, 'therapygo'),
    settings.getNativePushProjectId('therapygo'),
  ]);
  return NextResponse.json({
    ok: true,
    ...status,
    projectId,
    ...(projectId ? {} : { runtime: 'unavailable' }),
  });
}

export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess();
  if (!gate.ok) return gate.response;
  const parsed = registration.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  try {
    await services().targets.register({
      userId: gate.session.user.userId,
      appId: 'therapygo',
      ...parsed.data,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'native_push_installation_conflict') {
      return NextResponse.json({ ok: false, error: 'installation_conflict' }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const gate = await requirePatientApiBusinessAccess();
  if (!gate.ok) return gate.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.installationId !== 'string' ||
    !isNativePushProvider(body.provider)
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  await services().targets.revoke(
    gate.session.user.userId,
    'therapygo',
    body.provider,
    body.installationId,
  );
  return NextResponse.json({ ok: true });
}

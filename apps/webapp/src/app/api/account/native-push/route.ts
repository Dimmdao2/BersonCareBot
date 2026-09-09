import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireAccountWebPushSelfApiSession } from '@/app-layer/guards/requireRole';
import { isNativePushProvider } from '@/modules/web-push/nativePush';

const registration = z.object({
  installationId: z.string().min(8).max(512),
  token: z.string().min(8).max(8192),
  provider: z.enum(['rustore', 'fcm', 'hms']),
});

function services() {
  const deps = buildAppDeps();
  return { targets: deps.nativePushTargets, settings: deps.systemSettings };
}

function unavailableResponse() {
  return NextResponse.json(
    { ok: false, error: 'native_push_unavailable' },
    { status: 503 },
  );
}

/** Account route fixes Therapysto and retains the existing staff second-factor boundary. */
export async function GET() {
  const gate = await requireAccountWebPushSelfApiSession();
  if (!gate.ok) return gate.response;
  const { targets, settings } = services();
  if (!targets) {
    return NextResponse.json({
      ok: true,
      active: false,
      providers: [],
      projectId: null,
      runtime: 'unavailable',
    });
  }
  const [status, projectId] = await Promise.all([
    targets.status(gate.session.user.userId, 'therapysto'),
    settings.getNativePushProjectId('therapysto'),
  ]);
  return NextResponse.json({
    ok: true,
    ...status,
    projectId,
    ...(projectId ? {} : { runtime: 'unavailable' }),
  });
}

export async function POST(request: Request) {
  const gate = await requireAccountWebPushSelfApiSession();
  if (!gate.ok) return gate.response;
  const parsed = registration.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const { targets } = services();
  if (!targets) return unavailableResponse();
  try {
    await targets.register({
      userId: gate.session.user.userId,
      appId: 'therapysto',
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
  const gate = await requireAccountWebPushSelfApiSession();
  if (!gate.ok) return gate.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.installationId !== 'string' ||
    !isNativePushProvider(body.provider)
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const { targets } = services();
  if (!targets) return unavailableResponse();
  await targets.revoke(
    gate.session.user.userId,
    'therapysto',
    body.provider,
    body.installationId,
  );
  return NextResponse.json({ ok: true });
}

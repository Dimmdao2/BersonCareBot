import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

export async function GET(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  const limitRaw = url.searchParams.get('limit');
  const limit =
    limitRaw != null && /^\d+$/.test(limitRaw.trim())
      ? Math.min(100, Math.max(1, Number.parseInt(limitRaw, 10)))
      : 50;

  const { items, nextCursor } = await buildAppDeps().healthFailureArchive.listForDoctor({
    doctorUserId: gate.ctx.session.user.userId,
    limit,
    cursor,
  });

  return NextResponse.json({ ok: true, items, nextCursor });
}

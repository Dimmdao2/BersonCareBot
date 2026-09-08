/**
 * GET/POST /api/doctor/clients/:userId/notes — заметки врача о подписчике/клиенте.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { resolveDoctorCalendarDate } from '@/app-layer/booking/resolveDoctorCalendarIana';

const postBodySchema = z.object({
  text: z.string().max(8000),
  noteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedRevision: z.number().int().min(0).optional(),
});

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

  const notes = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.doctorNotes.listForUser(identity.userId, gate.ctx.session.user.userId),
  );
  const today = await resolveDoctorCalendarDate(gate.ctx.session.user.userId);
  return NextResponse.json({ ok: true, notes, today });
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
    const result = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.doctorNotes.saveDaily({
        userId: identity.userId,
        authorId: session.user.userId,
        ...parsed.data,
      }),
    );
    if (result.kind === 'conflict') {
      return NextResponse.json(
        { ok: false, error: 'revision_conflict', note: result.note },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, note: result.note });
  } catch (e) {
    throw e;
  }
}

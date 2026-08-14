/**
 * GET/POST /api/doctor/clients/:userId/notes — заметки врача о подписчике/клиенте.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';

const postBodySchema = z.object({
  text: z.string().min(1).max(8000),
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
    deps.doctorNotes.listForUser(identity.userId),
  );
  return NextResponse.json({ ok: true, notes });
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
    const note = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.doctorNotes.create({
        userId: identity.userId,
        authorId: session.user.userId,
        text: parsed.data.text,
      }),
    );
    return NextResponse.json({ ok: true, note });
  } catch (e) {
    if (e instanceof Error && e.message === 'empty_note') {
      return NextResponse.json({ ok: false, error: 'empty_note' }, { status: 400 });
    }
    throw e;
  }
}

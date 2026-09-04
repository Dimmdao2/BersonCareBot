import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireDoctorWorkspaceApiContext,
  type DoctorWorkspaceAccessContext,
} from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { COMMENT_TYPES } from '@/modules/comments/types';
import type { EntityComment } from '@/modules/comments/types';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const patchBodySchema = z
  .object({
    body: z.string().min(1).max(32000).optional(),
    commentType: z.enum(COMMENT_TYPES).optional(),
  })
  .refine((b) => b.body !== undefined || b.commentType !== undefined, { message: 'empty_patch' });

function canMutateComment(authorId: string, ctx: DoctorWorkspaceAccessContext): boolean {
  return ctx.session.user.userId === authorId || ctx.session.user.role === 'admin';
}

function commentBelongsToWorkspace(comment: EntityComment, organizationId: string): boolean {
  return comment.organizationId === organizationId;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const item = await deps.comments.getById(id);
    if (!commentBelongsToWorkspace(item, gate.ctx.organizationId)) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item });
  } catch {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  let existing: EntityComment;
  try {
    existing = await deps.comments.getById(id);
  } catch {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (!commentBelongsToWorkspace(existing, gate.ctx.organizationId)) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (!canMutateComment(existing.authorId, gate.ctx)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  try {
    const item = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.comments.update(id, {
        body: parsed.data.body,
        commentType: parsed.data.commentType,
      }),
    );
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return respondWithSafeApiError('api/doctor/comments/[id]#update', e, {
      fallbackCode: 'comment_save_failed',
      fallbackStatus: 500,
    });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  let existing: EntityComment;
  try {
    existing = await deps.comments.getById(id);
  } catch {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (!commentBelongsToWorkspace(existing, gate.ctx.organizationId)) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (!canMutateComment(existing.authorId, gate.ctx)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  try {
    await withDoctorWorkspacePrincipal(gate.ctx, () => deps.comments.delete(id));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
}

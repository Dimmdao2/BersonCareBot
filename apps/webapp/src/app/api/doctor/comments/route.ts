import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { COMMENT_TARGET_TYPES, COMMENT_TYPES } from '@/modules/comments/types';
import type { CommentTargetType } from '@/modules/comments/types';

const listQuerySchema = z.object({
  targetType: z.enum(COMMENT_TARGET_TYPES),
  targetId: z.string().uuid(),
});

const postBodySchema = z.object({
  targetType: z.enum(COMMENT_TARGET_TYPES),
  targetId: z.string().uuid(),
  commentType: z.enum(COMMENT_TYPES),
  body: z.string().min(1).max(32000),
});

type AppDeps = ReturnType<typeof buildAppDeps>;

function isSupportedDoctorCommentTarget(targetType: CommentTargetType): boolean {
  return targetType === 'program_instance';
}

async function ensureDoctorCommentTargetInWorkspace(
  deps: AppDeps,
  targetType: CommentTargetType,
  targetId: string,
  organizationId: string,
): Promise<boolean> {
  if (!isSupportedDoctorCommentTarget(targetType)) return false;

  // `getInstanceById` resolves to `null` for a target that does not exist — that is the real 404 and
  // it is now checked for explicitly. The `try/catch` this replaces was standing in as the null guard
  // (reading `.organizationId` off `null` threw a TypeError, which the same catch turned into
  // `false`), and it swallowed every database failure into the identical answer. So a refused or
  // broken read told the doctor "такой программы не существует" about a program that does exist, and
  // left no trace. A failure now propagates and the route answers 500 instead of a confident 404.
  const instance = await deps.treatmentProgramInstance.getInstanceById(targetId);
  if (!instance) return false;
  return instance.organizationId === organizationId;
}

export async function GET(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!isSupportedDoctorCommentTarget(parsed.data.targetType)) {
    return NextResponse.json({ ok: false, error: 'unsupported_target_type' }, { status: 400 });
  }
  const targetOk = await ensureDoctorCommentTargetInWorkspace(
    deps,
    parsed.data.targetType,
    parsed.data.targetId,
    gate.ctx.organizationId,
  );
  if (!targetOk) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  try {
    const items = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.comments.listByTarget(parsed.data.targetType, parsed.data.targetId),
    );
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!isSupportedDoctorCommentTarget(parsed.data.targetType)) {
    return NextResponse.json({ ok: false, error: 'unsupported_target_type' }, { status: 400 });
  }
  const targetOk = await ensureDoctorCommentTargetInWorkspace(
    deps,
    parsed.data.targetType,
    parsed.data.targetId,
    gate.ctx.organizationId,
  );
  if (!targetOk) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  try {
    const item = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.comments.create(
        {
          targetType: parsed.data.targetType,
          targetId: parsed.data.targetId,
          commentType: parsed.data.commentType,
          body: parsed.data.body,
        },
        gate.ctx.session.user.userId,
      ),
    );
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

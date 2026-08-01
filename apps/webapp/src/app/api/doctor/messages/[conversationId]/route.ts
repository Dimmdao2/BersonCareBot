/**
 * GET /api/doctor/messages/[conversationId] — сообщения (опционально `since` для polling).
 * POST /api/doctor/messages/[conversationId] — ответ админа/врача (`text`).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { serializeSupportMessage } from '@/modules/messaging/serializeSupportMessage';
import { formatDoctorFio } from '@/shared/lib/fio';
import { selectPersonalChatSenderDisplayName } from '@/modules/messaging/notifyPatientDoctorReply';

const postBodySchema = z.object({
  text: z.string().min(1).max(4000),
  idempotencyKey: z.string().min(1).max(200).optional(),
});

type WorkspaceConversationRef = { organizationId?: string | null };

async function conversationBelongsToWorkspace(
  deps: ReturnType<typeof buildAppDeps>,
  conversation: WorkspaceConversationRef,
  organizationId: string,
): Promise<boolean> {
  return conversation.organizationId === organizationId;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { conversationId } = await context.params;
  if (!conversationId?.trim() || !z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_param' }, { status: 400 });
  }

  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get('since');
  const since = sinceRaw?.trim() ? sinceRaw.trim() : undefined;

  const deps = buildAppDeps();
  const full = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.supportCommunication.getConversationWithMessages(conversationId, gate.ctx.organizationId),
  );
  if (
    !full ||
    !(await conversationBelongsToWorkspace(deps, full.conversation, gate.ctx.organizationId))
  ) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const data = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.messaging.doctorSupport.getMessages(conversationId, {
      sinceCreatedAt: since ?? null,
      limit: 100,
      organizationId: gate.ctx.organizationId,
    }),
  );
  if (!data) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    conversationId,
    messages: data.messages.map(serializeSupportMessage),
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { conversationId } = await context.params;
  if (!conversationId?.trim() || !z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_param' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const full = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.supportCommunication.getConversationWithMessages(conversationId, gate.ctx.organizationId),
  );
  if (
    !full ||
    !(await conversationBelongsToWorkspace(deps, full.conversation, gate.ctx.organizationId))
  ) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const result = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.messaging.doctorSupport.sendAdminReply(
      conversationId,
      parsed.data.text,
      gate.ctx.organizationId,
      selectPersonalChatSenderDisplayName(
        formatDoctorFio({
          lastName: gate.ctx.session.user.lastName ?? null,
          firstName: gate.ctx.session.user.firstName ?? null,
          patronymic: gate.ctx.session.user.patronymic ?? null,
        }),
        gate.ctx.session.user.displayName,
      ),
      parsed.data.idempotencyKey,
    ),
  );
  if (!result.ok) {
    if (result.error === 'not_found') {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

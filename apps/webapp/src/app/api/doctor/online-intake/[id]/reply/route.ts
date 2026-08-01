/**
 * POST /api/doctor/online-intake/[id]/reply
 *
 * Sends a free-text reply to the patient's support chat conversation.
 * If the intake is still "new", auto-transitions to "in_review".
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOnlineIntakeService } from '@/app-layer/di/onlineIntakeDeps';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { logger, serializeError } from '@/infra/logging/logger';
import { formatDoctorFio } from '@/shared/lib/fio';
import { selectPersonalChatSenderDisplayName } from '@/modules/messaging/notifyPatientDoctorReply';

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
  idempotencyKey: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'validation_error' }, { status: 400 });
  }

  const { id } = await params;
  const intakeService = getOnlineIntakeService();
  const intake = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    intakeService.getRequestForDoctor(id),
  );
  if (!intake || intake.organizationId !== gate.ctx.organizationId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    intake.userId,
    gate.ctx.organizationId,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const { conversationId } = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.messaging.doctorSupport.ensureConversationForPatient(intake.userId),
  );

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
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  // Auto-advance "new" → "in_review" on first reply.
  // Best-effort: если переход упадёт — сообщение уже ушло пациенту, поэтому
  // логируем ошибку и возвращаем ok:true. Врач может поменять статус вручную.
  if (intake.status === 'new') {
    try {
      await withDoctorWorkspacePrincipal(gate.ctx, () =>
        intakeService.changeStatus({
          requestId: id,
          changedBy: gate.ctx.session.user.userId,
          toStatus: 'in_review',
          note: 'Автоматически при первом ответе',
        }),
      );
    } catch (err) {
      logger.error(
        { err: serializeError(err) },
        '[reply-route] auto-transition new→in_review failed',
      );
    }
  }

  return NextResponse.json({ ok: true });
}

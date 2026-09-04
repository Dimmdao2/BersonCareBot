import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildWebappProgramNoteReplyIntegratorMessageId } from '@/modules/messaging/programNoteReplyIdempotency';
import { formatDoctorFio } from '@/shared/lib/fio';
import { selectPersonalChatSenderDisplayName } from '@/modules/messaging/notifyPatientDoctorReply';
import { webappPlatformConversationId } from '@/modules/messaging/supportConversationIds';
import { RuntimeSettingUnavailableError } from '@/modules/system-settings/runtimeSettingUnavailable';

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ instanceId: string; stageItemId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const { instanceId, stageItemId } = await context.params;
  if (
    !z.string().uuid().safeParse(instanceId).success ||
    !z.string().uuid().safeParse(stageItemId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();

  const instance = await deps.treatmentProgramInstance.getInstanceById(instanceId);
  if (!instance || instance.organizationId !== gate.ctx.organizationId)
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  const hasItem = instance.stages.some((stage) =>
    stage.items.some((item) => item.id === stageItemId),
  );
  if (!hasItem) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  // Флаг читаем объявленным runtime-корнем под принципалом врача. Прямое чтение
  // `system_settings` со staff-порта запрещено RLS для глобальных admin-строк (видны только
  // `organization_id = current_org_id()` и `scope = 'doctor'`), поэтому раньше строка
  // «включено» приходила как `null` и отправка комментария падала `feature_disabled`.
  let replyEnabled: boolean;
  try {
    replyEnabled = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.runtimeConfig.getBoolean('patient_program_discussion_doctor_reply_from_log_enabled', {
        patientUserId: instance.patientUserId,
        organizationId: gate.ctx.organizationId,
      }),
    );
  } catch (error) {
    if (error instanceof RuntimeSettingUnavailableError) {
      // Настройка не прочиталась — у нас нет ответа «включено/выключено». Не выдаём это за
      // «функция отключена» и не показываем внутреннюю ошибку: отвечаем «временно недоступно».
      return NextResponse.json({ ok: false, error: 'setting_unavailable' }, { status: 503 });
    }
    throw error;
  }
  if (!replyEnabled) {
    return NextResponse.json({ ok: false, error: 'feature_disabled' }, { status: 403 });
  }

  const result = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.sendProgramNoteReply({
      integratorConversationId: webappPlatformConversationId(instance.patientUserId),
      integratorMessageId: buildWebappProgramNoteReplyIntegratorMessageId({
        doctorUserId: session.user.userId,
        instanceId,
        stageItemId,
        text: parsed.data.text,
      }),
      stageItemId,
      text: parsed.data.text,
      senderDisplayName: selectPersonalChatSenderDisplayName(
        formatDoctorFio({
          lastName: session.user.lastName ?? null,
          firstName: session.user.firstName ?? null,
          patronymic: session.user.patronymic ?? null,
        }),
        session.user.displayName,
      ),
      source: 'webapp',
    }),
  );
  if (!result.ok) {
    const status = result.error === 'stage_item_not_found' ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}

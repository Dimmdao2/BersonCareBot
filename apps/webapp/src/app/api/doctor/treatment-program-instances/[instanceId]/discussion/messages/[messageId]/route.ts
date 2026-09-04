import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ instanceId: string; messageId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { instanceId, messageId } = await context.params;
  if (
    !z.string().uuid().safeParse(instanceId).success ||
    !z.string().uuid().safeParse(messageId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const instance = await deps.treatmentProgramInstance.getInstanceById(instanceId);
  if (!instance || instance.organizationId !== gate.ctx.organizationId)
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  const identity = await deps.doctorClientsPort.getClientIdentity(instance.patientUserId);
  if (!identity) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  if (instance.assignmentSource !== 'doctor') {
    return NextResponse.json({ ok: false, error: 'program_not_doctor_assigned' }, { status: 400 });
  }

  try {
    await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.programItemDiscussion.deletePatientMediaMessage({
        messageId,
        patientUserId: instance.patientUserId,
      }),
    );
    return NextResponse.json({ ok: true, deleted: true });
  } catch (e) {
    return respondWithSafeApiError(
      'api/doctor/treatment-program-instances/[instanceId]/discussion/messages/[messageId]',
      e,
      {
        fallbackCode: 'discussion_messages_failed',
        fallbackStatus: 500,
        domainStatus: (text) =>
          text === 'message_not_found'
            ? 404
            : text === 'message_not_media' || text === 'message_not_deletable'
              ? 400
              : 400,
      },
    );
  }
}

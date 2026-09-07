import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import type { TreatmentProgramInstanceDetail } from '@/modules/treatment-program/types';
import {
  isClientChannelAllowed,
  type ClientChannelPolicy,
} from '@/modules/doctor-clients/supportPolicy';

type AppDeps = ReturnType<typeof buildAppDeps>;

export async function resolveDoctorInstanceInWorkspace(
  deps: AppDeps,
  ctx: DoctorWorkspaceAccessContext,
  instanceId: string,
  options: {
    requireDoctorAssigned?: boolean;
    clientChannel?: keyof ClientChannelPolicy;
  } = {},
): Promise<
  { ok: true; instance: TreatmentProgramInstanceDetail } | { ok: false; response: NextResponse }
> {
  let instance: TreatmentProgramInstanceDetail;
  try {
    instance = await deps.treatmentProgramInstance.getInstanceById(instanceId);
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 }),
    };
  }

  if (instance.organizationId !== ctx.organizationId) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 }),
    };
  }

  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    instance.patientUserId,
    ctx.organizationId,
    ctx,
  );
  if (!identity) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 }),
    };
  }

  if (options.requireDoctorAssigned === true && instance.assignmentSource !== 'doctor') {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'program_not_doctor_assigned' },
        { status: 400 },
      ),
    };
  }

  const policy = options.clientChannel
    ? await deps.doctorClients.getClientChannelPolicy(instance.patientUserId, {
        organizationId: ctx.organizationId,
      })
    : null;
  if (options.clientChannel && policy && !isClientChannelAllowed(policy, options.clientChannel)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 }),
    };
  }

  return { ok: true, instance };
}

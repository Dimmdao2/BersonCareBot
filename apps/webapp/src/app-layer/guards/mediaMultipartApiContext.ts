import { runWithDbPatientPrincipal } from '@bersoncare/db-principal';
import { requireDoctorWorkspaceApiContext, requirePatientApiBusinessAccess } from './requireRole';
import { withDoctorWorkspacePrincipal } from './doctorWorkspacePrincipal';

export type MediaMultipartApiContext =
  | {
      kind: 'doctor';
      userId: string;
      organizationId: string;
      doctor: Awaited<ReturnType<typeof requireDoctorWorkspaceApiContext>> & { ok: true };
    }
  | { kind: 'patient'; userId: string };

/** One auth boundary for generic multipart session operations; DB identity remains server-installed. */
export async function requireMediaMultipartApiContext(): Promise<
  { ok: true; ctx: MediaMultipartApiContext } | { ok: false; response: Response }
> {
  const doctor = await requireDoctorWorkspaceApiContext();
  if (doctor.ok) {
    return {
      ok: true,
      ctx: {
        kind: 'doctor',
        userId: doctor.ctx.session.user.userId,
        organizationId: doctor.ctx.organizationId,
        doctor,
      },
    };
  }
  const patient = await requirePatientApiBusinessAccess();
  if (!patient.ok) return patient;
  return { ok: true, ctx: { kind: 'patient', userId: patient.session.user.userId } };
}

export function withMediaMultipartPrincipal<T>(
  ctx: MediaMultipartApiContext,
  organizationId: string,
  source: string,
  action: () => Promise<T>,
): Promise<T> {
  if (ctx.kind === 'doctor') return withDoctorWorkspacePrincipal(ctx.doctor.ctx, action);
  return runWithDbPatientPrincipal({ platformUserId: ctx.userId, organizationId, source }, action);
}

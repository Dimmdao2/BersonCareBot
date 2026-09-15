import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';

export type DoctorMedicalConflictAttention =
  { show: true; href: string; count: number } | { show: false };

/** Request-local projection for the Today attention banner; details remain behind the dedicated API door. */
export async function loadDoctorMedicalConflictAttention(workspace: {
  organizationId: string;
}): Promise<DoctorMedicalConflictAttention> {
  const service = buildAppDeps().patientMergeCandidate;
  if (!service) return { show: false };
  const summary = await withDoctorWorkspacePrincipal(workspace, () =>
    service.medicalConflictSummary(workspace.organizationId),
  );
  const conflictId = summary.conflictIds[0];
  if (!conflictId) return { show: false };
  return {
    show: true,
    count: summary.conflictIds.length,
    href: `/app/doctor/patients?medicalConflict=${encodeURIComponent(conflictId)}`,
  };
}

import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal as withSourcedDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';

export function withDoctorWorkspacePrincipal<T>(
  ctx: Pick<DoctorWorkspaceAccessContext, 'organizationId'>,
  fn: () => T,
): T;

export function withDoctorWorkspacePrincipal<T>(
  ctx: Pick<DoctorWorkspaceAccessContext, 'organizationId'>,
  source: string,
  fn: () => Promise<T>,
): Promise<T>;

export function withDoctorWorkspacePrincipal<T>(
  ctx: Pick<DoctorWorkspaceAccessContext, 'organizationId'>,
  sourceOrFn: string | (() => T),
  maybeFn?: () => Promise<T>,
): T | Promise<T> {
  if (typeof sourceOrFn === 'function') {
    return withSourcedDoctorWorkspacePrincipal(ctx, 'doctor.workspace', sourceOrFn);
  }
  if (!maybeFn) throw new Error('principal_callback_required');
  return withSourcedDoctorWorkspacePrincipal(ctx, sourceOrFn, maybeFn);
}

/**
 * Owner ruling 2026-07-26: the global-admin/platform-operator interface lives at `/app/admin/*`.
 * This layout is the merge of the four PLAT-01…09 slices' `app/platform/layout.tsx` (deleted; its
 * guard, shell config and doc-comment below are unchanged) with the pre-existing `/app/admin`
 * shell that only served `/app/admin/promo` (a legacy redirect stub, kept — see promo/page.tsx).
 *
 * Guard reconciliation (done once, here, not re-litigated per route): the old `/app/admin`
 * layout checked only `session.user.role !== "admin"`. That is WEAKER than
 * `requirePlatformOperationsPage()`: it never checked `adminMode` (in practice always forced true
 * for role "admin" — `ensureAdminMode` in `modules/auth/service.ts` — so no legitimate admin
 * session is newly excluded), and never stamped the platform DB principal that every moved
 * `admin/*` settings page needs to read
 * `system_settings` (see the long comment on `requirePlatformOperationsPage` in
 * `app-layer/guards/requireRole.ts` — without that stamp these reads 42501 under the nonstaff
 * pool). `requirePlatformOperationsPage()` is therefore strictly no weaker and is now the only
 * guard for this subtree, including `/app/admin/promo`.
 */
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import '../../styles/doctor.css';
import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { staffPwaLayoutMetadata } from '@/shared/lib/pwa/staffPwaLayoutMetadata';
import { DoctorWorkspaceShell } from '@/shared/ui/doctor/shell/DoctorWorkspaceShell';

export const metadata: Metadata = staffPwaLayoutMetadata;

/** URL-preserving platform branch. It never resolves or renders a tenant workspace. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requirePlatformOperationsPage();
  return (
    <DoctorWorkspaceShell
      adminMode={true}
      enableTenantRuntime={false}
      menuKind="platform"
      userRole={session.user.role}
      userDisplayName={session.user.displayName}
    >
      {children}
    </DoctorWorkspaceShell>
  );
}

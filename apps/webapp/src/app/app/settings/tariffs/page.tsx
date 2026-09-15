import { redirect } from 'next/navigation';
import { runWithDbClinicBillingPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireOrganizationWorkspaceContext } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { TariffComparison } from './TariffComparison';

export default async function TariffsPage() {
  const workspace = await requireOrganizationWorkspaceContext({ allowCabinetRecovery: true });
  const canAccessBilling =
    workspace.membershipRole === 'owner' ||
    workspace.membershipRole === 'admin' ||
    workspace.session.user.role === 'admin';
  if (!canAccessBilling) redirect(routePaths.account);

  const deps = buildAppDeps();
  const principal = {
    organizationId: workspace.organizationId,
    platformUserId: workspace.session.user.userId,
  };
  const billing = await runWithDbClinicBillingPrincipal(
    { ...principal, source: 'clinic-billing-tariff-catalog-read' },
    () => deps.saasBilling.getOrganizationBillingOverview(workspace.organizationId),
  );
  const tariffChange = await runWithDbClinicBillingPrincipal(
    { ...principal, source: 'clinic-billing-tariff-change-read' },
    () => deps.saasBilling.getOwnTariffChangeState(workspace.organizationId),
  );
  return (
    <DoctorAppShell
      title="Выбор тарифа"
      user={workspace.session.user}
      backHref={`${routePaths.settings}?tab=tariff`}
      backLabel="К тарифу"
    >
      <DoctorPageHeader title="Выбор тарифа" />
      <TariffComparison
        tariffChange={tariffChange}
        billingEmail={billing.billingEmail}
      />
    </DoctorAppShell>
  );
}

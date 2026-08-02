import { notFound, redirect } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForPage } from '@/app-layer/guards/requireEntitlement';
import { getOptionalPatientSession } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { PatientPackageDetailClient } from './PatientPackageDetailClient';

type Props = { params: Promise<{ id: string }> };

export default async function PatientMembershipDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getOptionalPatientSession();
  if (!session) redirect(routePaths.patient);
  const organizationId = await buildAppDeps().memberships?.resolvePatientPackageOrganizationId(id);
  if (!organizationId) notFound();
  await requireEntitlementForPage({ organizationId }, 'subscriptions');
  return <PatientPackageDetailClient patientPackageId={id} />;
}

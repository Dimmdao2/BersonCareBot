import { notFound, redirect } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getOptionalPatientSession } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { resolvePatientOrganizationIdForRsc } from '../../booking/bookingCatalogRsc';
import { PatientPackageDetailClient } from './PatientPackageDetailClient';

type Props = { params: Promise<{ id: string }> };

export default async function PatientMembershipDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getOptionalPatientSession();
  if (!session) redirect(routePaths.patient);
  const organizationId = await resolvePatientOrganizationIdForRsc(
    buildAppDeps(),
    session.user.userId,
  );
  if (!organizationId) notFound();
  return <PatientPackageDetailClient patientPackageId={id} />;
}

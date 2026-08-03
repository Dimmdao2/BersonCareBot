import { redirect } from 'next/navigation';
import { PatientPackagePayClient } from './PatientPackagePayClient';
import {
  getMechanicMutationAvailability,
  requireEntitlementForPage,
} from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getOptionalPatientSession } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';

type Props = { searchParams: Promise<{ patientPackageId?: string }> };

export default async function PatientPackagePayPage({ searchParams }: Props) {
  const { patientPackageId } = await searchParams;
  if (!patientPackageId?.trim()) redirect(routePaths.patientBooking);
  const session = await getOptionalPatientSession();
  if (!session) redirect(routePaths.patient);
  const organizationId = await buildAppDeps().memberships?.resolvePatientPackageOrganizationId(
    patientPackageId.trim(),
  );
  if (!organizationId) redirect(routePaths.patientBooking);
  await requireEntitlementForPage({ organizationId }, 'subscriptions');
  const [subscriptionsAvailability, paymentsAvailability] = await Promise.all([
    getMechanicMutationAvailability({ organizationId }, 'subscriptions'),
    getMechanicMutationAvailability({ organizationId }, 'payments'),
  ]);
  if (!subscriptionsAvailability.available || !paymentsAvailability.available) {
    redirect(routePaths.patientBooking);
  }
  return <PatientPackagePayClient patientPackageId={patientPackageId.trim()} />;
}

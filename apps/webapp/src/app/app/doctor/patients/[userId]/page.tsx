/**
 * /app/doctor/patients/[userId] — карточка пациента.
 * Pattern: requireDoctorAccess → buildAppDeps → pass promise to PatientCardClient.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button-variants';
import { doctorPageStackClass } from '@/shared/ui/doctor/doctorVisual';
import { cn } from '@/lib/utils';
import { toDoctorSupplementaryContacts } from '@/modules/platform-user-contacts/bookingContactUpsert';
import { loadDoctorPatientProgramActivity } from '../loadDoctorPatientProgramActivity';
import { PatientCardClient } from './PatientCardClient';
import type { PatientProgramInteractionPolicy } from '@/modules/doctor-clients/supportPolicy';
import { sanitizePatientListReturnHref } from '../patientListWorkspaceState';

type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DoctorPatientCardPage({ params, searchParams }: PageProps) {
  const { userId } = await params;
  const sp = await searchParams;

  if (!z.string().uuid().safeParse(userId).success) {
    notFound();
  }

  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    workspace.organizationId,
  );
  if (!identity) {
    notFound();
  }
  const patientUserId = identity.userId;

  const [
    cardHeaderPromise,
    clinicalState,
    visits,
    notes,
    tasks,
    programActivity,
    appointments,
    programInstances,
    patientFileRecords,
    anamnesis,
    comorbidities,
    paymentsSummary,
    rawContactRows,
    portalState,
  ] = await Promise.all([
    deps.doctorClients.getPatientCardHeader(patientUserId),
    withDoctorWorkspacePrincipal(workspace, () =>
      deps.patientClinical.getClinicalState(patientUserId),
    ),
    withDoctorWorkspacePrincipal(workspace, () => deps.patientClinical.listVisits(patientUserId)),
    deps.doctorNotes.listForUser(patientUserId),
    deps.specialistTasks.listPatientTasks(session.user.userId, patientUserId, false),
    loadDoctorPatientProgramActivity(
      { programItemDiscussion: deps.programItemDiscussion },
      {
        patientUserId,
        viewerUserId: session.user.userId,
        organizationId: workspace.organizationId,
      },
    ),
    deps.doctorClientsPort.listPatientAppointments(patientUserId, workspace.organizationId),
    withDoctorWorkspacePrincipal(workspace, () =>
      deps.treatmentProgramInstance.listForPatientClinicalView(patientUserId),
    ).then((instances) =>
      instances.filter((instance) => instance.organizationId === workspace.organizationId),
    ),
    withDoctorWorkspacePrincipal(workspace, () => deps.patientFiles.listFiles(patientUserId)),
    withDoctorWorkspacePrincipal(workspace, () => deps.patientClinical.getAnamnesis(patientUserId)),
    withDoctorWorkspacePrincipal(workspace, () =>
      deps.patientComorbidities.listActive(patientUserId),
    ),
    withDoctorWorkspacePrincipal(workspace, () =>
      deps.patientPayments.listPaymentsWithSummary(patientUserId),
    ),
    deps.platformUserContacts.listForPlatformUser(patientUserId),
    withDoctorWorkspacePrincipal(workspace, () =>
      deps.patientInvites.getPortalStatus(workspace.organizationId, patientUserId),
    ),
  ]);

  // Unpack payments summary — listPaymentsWithSummary returns { payments, totalPaidMinor }.
  const patientPaymentRows = paymentsSummary.payments;

  // Parallel-fetch remaining SSR data that depends on selected workspace or is otherwise independent.
  const [historyEvents, initialPackages, , initialSupportEffectivePolicy] = await Promise.all([
    deps.payments
      ? deps.payments
          .listPaymentHistoryForUser(patientUserId, workspace.organizationId)
          .catch(() => [])
      : Promise.resolve(
          [] as Awaited<ReturnType<NonNullable<typeof deps.payments>['listPaymentHistoryForUser']>>,
        ),
    deps.memberships
      ? deps.memberships
          .listPatientPackagesForUser(patientUserId, workspace.organizationId)
          .catch(() => null)
      : Promise.resolve(null),
    deps.doctorClients.getClientSupport(patientUserId).catch(() => null), // fetched but only effectivePolicy is surfaced to UI
    deps.doctorClients
      .getPatientProgramInteractionPolicy(patientUserId)
      .catch((): PatientProgramInteractionPolicy | null => null),
  ]);

  type TimelineEntry = {
    id: string;
    occurredAt: string;
    kind: 'cash' | 'acquiring' | 'booking_prepayment' | 'booking_refund';
    status: string;
    amountMinor: number | null;
    currency: string;
    description: string | null;
    provider: string | null;
    appointmentId: string | null;
  };
  const financesTimeline: TimelineEntry[] = [
    ...patientPaymentRows.map((p) => ({
      id: p.id,
      occurredAt: p.createdAt,
      kind: p.kind as 'cash' | 'acquiring',
      status: p.status,
      amountMinor: p.amountMinor,
      currency: p.currency,
      description: p.service ?? p.comment ?? null,
      provider: p.provider ?? null,
      appointmentId: p.visitId ?? null,
    })),
    ...historyEvents.map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt,
      kind: (e.eventType.toLowerCase().includes('refund')
        ? 'booking_refund'
        : 'booking_prepayment') as 'booking_prepayment' | 'booking_refund',
      status: e.status ?? e.eventType,
      amountMinor: e.amountMinor,
      currency: e.currency ?? 'RUB',
      description: e.purpose ?? e.comment ?? null,
      provider: e.providerId ?? null,
      appointmentId: e.appointmentId ?? null,
    })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const totalCashMinor = patientPaymentRows
    .filter((p) => p.kind === 'cash' && p.status === 'paid')
    .reduce((s, p) => s + p.amountMinor, 0);
  const totalAcquiringMinor = patientPaymentRows
    .filter((p) => p.kind === 'acquiring' && p.status === 'paid')
    .reduce((s, p) => s + p.amountMinor, 0);
  const initialFinancesData = { timeline: financesTimeline, totalCashMinor, totalAcquiringMinor };

  // Shape payments summary for PatientTabRecords (PaymentsPanel).
  const initialPaymentsSummary = {
    payments: patientPaymentRows.map((p) => ({
      id: p.id,
      amountMinor: p.amountMinor,
      currency: p.currency,
      kind: p.kind as 'cash' | 'acquiring',
      status: p.status,
      comment: p.comment ?? null,
      service: p.service ?? null,
      visitId: p.visitId ?? null,
      createdAt: p.createdAt,
    })),
    totalPaidMinor: paymentsSummary.totalPaidMinor,
  };

  // Shape packages for MembershipPanel (ApiPackage shape: { id, title, status, validUntil, balance.items }).
  // ST-07: include displayRemaining so the Overview widget can show it (reserved sessions count as still-owned).
  const initialPackagesForTabs = initialPackages
    ? initialPackages.map((pkg) => ({
        id: pkg.id,
        displayNumber: pkg.displayNumber,
        title: pkg.title,
        status: pkg.status,
        soldAt: pkg.soldAt ?? null,
        validUntil: pkg.validUntil ?? null,
        balance: {
          items: pkg.balance.items.map((item) => ({
            quantityInitial: item.quantityInitial,
            remaining: item.remaining,
            displayRemaining: item.displayRemaining,
            serviceTitle: item.serviceTitle ?? null,
          })),
        },
      }))
    : null;

  // Map file records to UI shape (previewUrl omitted — S3 presigning deferred to client).
  const initialFiles = patientFileRecords.map((f) => ({ ...f, previewUrl: null }));

  // Filter supplementary contacts using the header's identity (same logic as the route handler).
  const initialSupplementaryContacts = cardHeaderPromise
    ? toDoctorSupplementaryContacts(rawContactRows, {
        phone: cardHeaderPromise.identity.phone,
        email: cardHeaderPromise.identity.email,
      })
    : rawContactRows.map((r) => ({
        id: r.id,
        contactType: r.contactType,
        value: r.value,
        source: r.source,
      }));

  const initialTab = typeof sp.tab === 'string' ? sp.tab : undefined;
  const createVisitFrom = typeof sp.createVisitFrom === 'string' ? sp.createVisitFrom : undefined;
  const visitDate = typeof sp.visitDate === 'string' ? sp.visitDate : undefined;
  const patientListHref = sanitizePatientListReturnHref(sp.returnTo);

  return (
    <DoctorAppShell title="Карточка пациента" user={session.user} backHref={patientListHref}>
      <DoctorPageHeader
        id="doctor-patient-card-header"
        title="Карточка пациента"
        tabs={
          <Link
            href={patientListHref}
            className={cn(
              buttonVariants({ size: 'sm', variant: 'outline' }),
              'h-8 rounded-[var(--doctor-control-radius,24px)] px-3',
            )}
          >
            К клиентам
          </Link>
        }
      />
      <section className={doctorPageStackClass}>
        <PatientCardClient
          cardHeader={cardHeaderPromise}
          initialTab={initialTab}
          createVisitFrom={createVisitFrom}
          visitDate={visitDate}
          initialClinicalState={clinicalState}
          initialVisits={visits}
          initialNotes={notes}
          initialTasks={tasks}
          initialProgramActivity={programActivity}
          initialAppointments={appointments}
          initialProgramInstances={programInstances}
          initialFiles={initialFiles}
          initialAnamnesis={anamnesis}
          initialComorbidities={comorbidities}
          initialFinancesData={initialFinancesData}
          initialSupplementaryContacts={initialSupplementaryContacts}
          initialPackages={initialPackagesForTabs}
          initialPaymentsSummary={initialPaymentsSummary}
          initialSupportEffectivePolicy={initialSupportEffectivePolicy}
          initialPortalState={portalState}
          isAdmin={session.user.role === 'admin'}
        />
      </section>
    </DoctorAppShell>
  );
}

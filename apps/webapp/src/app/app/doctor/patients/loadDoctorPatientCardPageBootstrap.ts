import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  getMechanicMutationAvailability,
  getMechanicSurfaceVisibility,
  requireEntitlementForReadAction,
} from '@/app-layer/guards/requireEntitlement';
import { toDoctorSupplementaryContacts } from '@/modules/platform-user-contacts/bookingContactUpsert';
import type { PatientProgramInteractionPolicy } from '@/modules/doctor-clients/supportPolicy';
import { loadDoctorPatientProgramActivity } from './loadDoctorPatientProgramActivity';
import {
  currentPatientExerciseCalendarMonthRange,
  loadDoctorPatientExerciseCalendar,
} from './loadDoctorPatientExerciseCalendar';
import { loadDoctorPatientMessagesSnapshot } from './loadDoctorPatientMessagesSnapshot';
import type { TreatmentProgramInstanceDetail } from '@/modules/treatment-program/types';
import { pickOpenTreatmentProgramInstance } from './treatmentProgramInstanceOpen';

export type PatientCardTabId =
  | 'overview'
  | 'karta'
  | 'program'
  | 'records'
  | 'files'
  | 'account'
  | 'comms'
  | 'finances';

const PATIENT_CARD_TABS: PatientCardTabId[] = [
  'overview',
  'karta',
  'program',
  'records',
  'files',
  'account',
  'comms',
  'finances',
];

export function resolvePatientCardTab(tab: string | undefined): PatientCardTabId {
  if (tab && PATIENT_CARD_TABS.includes(tab as PatientCardTabId)) {
    return tab as PatientCardTabId;
  }
  return 'overview';
}

type Deps = ReturnType<typeof buildAppDeps>;

export type DoctorPatientCardPageBootstrap = {
  activeTab: PatientCardTabId;
  membershipMutationAllowed: boolean;
  membershipsVisible: boolean;
  specialistTasksAvailable: boolean;
  specialistTasksReadable: boolean;
  cardHeader: Awaited<ReturnType<Deps['doctorClients']['getPatientCardHeader']>>;
  initialClinicalState: Awaited<ReturnType<Deps['patientClinical']['getClinicalState']>> | null;
  initialVisits: Awaited<ReturnType<Deps['patientClinical']['listVisits']>> | null;
  initialNotes: Awaited<ReturnType<Deps['doctorNotes']['listForUser']>> | null;
  initialTasks: Awaited<ReturnType<Deps['specialistTasks']['listPatientTasks']>> | null;
  initialProgramActivity: Awaited<ReturnType<typeof loadDoctorPatientProgramActivity>> | null;
  initialAppointments: Awaited<
    ReturnType<Deps['doctorClientsPort']['listPatientAppointments']>
  > | null;
  initialProgramInstances: Awaited<
    ReturnType<Deps['treatmentProgramInstance']['listForPatientClinicalView']>
  > | null;
  initialFiles:
    | Array<
        Awaited<ReturnType<Deps['patientFiles']['listFiles']>>[number] & { previewUrl: null }
      >
    | null;
  initialAnamnesis: Awaited<ReturnType<Deps['patientClinical']['getAnamnesis']>> | null;
  initialComorbidities: Awaited<ReturnType<Deps['patientComorbidities']['listActive']>> | null;
  initialFinancesData: {
    timeline: Array<{
      id: string;
      occurredAt: string;
      kind: 'cash' | 'acquiring' | 'booking_prepayment' | 'booking_refund';
      status: string;
      amountMinor: number | null;
      currency: string;
      description: string | null;
      provider: string | null;
      appointmentId: string | null;
    }>;
    totalCashMinor: number;
    totalAcquiringMinor: number;
  } | null;
  initialSupplementaryContacts: Awaited<
    ReturnType<typeof toDoctorSupplementaryContacts>
  > | null;
  initialPackages: Array<{
    id: string;
    displayNumber?: number | null;
    title: string;
    status: string;
    soldAt?: string | null;
    validUntil: string | null;
    balance: {
      items: Array<{
        quantityInitial: number;
        remaining: number;
        displayRemaining: number;
        serviceTitle: string | null;
      }>;
    };
  }> | null;
  initialPaymentsSummary: {
    payments: Array<{
      id: string;
      amountMinor: number;
      currency: string;
      kind: 'cash' | 'acquiring';
      status: string;
      comment: string | null;
      service: string | null;
      visitId: string | null;
      createdAt: string;
    }>;
    totalPaidMinor: number;
  } | null;
  initialSupportEffectivePolicy: PatientProgramInteractionPolicy | null;
  initialPortalState: Awaited<ReturnType<Deps['patientInvites']['getPortalStatus']>> | null;
  initialExerciseCalendarDays: Awaited<ReturnType<typeof loadDoctorPatientExerciseCalendar>> | null;
  initialMessagesSnapshot: Awaited<ReturnType<typeof loadDoctorPatientMessagesSnapshot>> | null;
  /** Open program instance detail for overview widget (stages/items). */
  initialProgramInstanceDetail: TreatmentProgramInstanceDetail | null;
};

function shapePackages(
  initialPackages: Awaited<
    ReturnType<NonNullable<Deps['memberships']>['listPatientPackagesForUser']>
  > | null,
) {
  if (!initialPackages) return null;
  return initialPackages.map((pkg) => ({
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
  }));
}

function buildFinancesTimeline(
  patientPaymentRows: Array<{
    id: string;
    createdAt: string;
    kind: string;
    status: string;
    amountMinor: number;
    currency: string;
    service?: string | null;
    comment?: string | null;
    provider?: string | null;
    visitId?: string | null;
  }>,
  historyEvents: Array<{
    id: string;
    occurredAt: string;
    eventType: string;
    status?: string | null;
    amountMinor: number | null;
    currency?: string | null;
    purpose?: string | null;
    comment?: string | null;
    providerId?: string | null;
    appointmentId?: string | null;
  }>,
) {
  const timeline = [
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

  return { timeline, totalCashMinor, totalAcquiringMinor };
}

export async function loadDoctorPatientCardPageBootstrap(
  deps: Deps,
  workspace: DoctorWorkspaceAccessContext,
  patientUserId: string,
  activeTab: PatientCardTabId,
): Promise<DoctorPatientCardPageBootstrap> {
  const session = workspace.session;
  const membershipAccess = await getMechanicSurfaceVisibility(workspace, 'subscriptions');
  const membershipMutation = membershipAccess.specialistNavigation
    ? await getMechanicMutationAvailability(workspace, 'subscriptions')
    : { available: false as const };
  const specialistTasksAvailability = await getMechanicMutationAvailability(
    workspace,
    'specialist_tasks',
  );
  const specialistTasksRead = await requireEntitlementForReadAction(workspace, 'specialist_tasks');

  const cardHeaderPromise = deps.doctorClients.getPatientCardHeader(patientUserId);

  const membershipMeta = {
    activeTab,
    membershipMutationAllowed: membershipMutation.available,
    membershipsVisible: membershipAccess.specialistNavigation,
    specialistTasksAvailable: specialistTasksAvailability.available,
    specialistTasksReadable: specialistTasksRead.ok,
  };

  const nullTabData = {
    initialClinicalState: null,
    initialVisits: null,
    initialNotes: null,
    initialTasks: null,
    initialProgramActivity: null,
    initialAppointments: null,
    initialProgramInstances: null,
    initialFiles: null,
    initialAnamnesis: null,
    initialComorbidities: null,
    initialFinancesData: null,
    initialSupplementaryContacts: null,
    initialPackages: null,
    initialPaymentsSummary: null,
    initialSupportEffectivePolicy: null,
    initialPortalState: null,
    initialExerciseCalendarDays: null,
    initialMessagesSnapshot: null,
    initialProgramInstanceDetail: null,
  };

  const loadClinicalBundle = async () => {
    const [clinicalState, visits] = await Promise.all([
      withDoctorWorkspacePrincipal(workspace, () =>
        deps.patientClinical.getClinicalState(patientUserId),
      ),
      withDoctorWorkspacePrincipal(workspace, () => deps.patientClinical.listVisits(patientUserId)),
    ]);
    return { clinicalState, visits };
  };

  const loadProgramInstances = async () =>
    withDoctorWorkspacePrincipal(workspace, () =>
      deps.treatmentProgramInstance.listForPatientClinicalView(patientUserId),
    ).then((instances) =>
      instances.filter((instance) => instance.organizationId === workspace.organizationId),
    );

  const loadProgramBundle = async () => {
    const programInstances = await loadProgramInstances();
    const openInstance = pickOpenTreatmentProgramInstance(programInstances);
    if (!openInstance) {
      return { programInstances, initialProgramInstanceDetail: null as TreatmentProgramInstanceDetail | null };
    }
    const detail = await withDoctorWorkspacePrincipal(workspace, () =>
      deps.treatmentProgramInstance.getInstanceById(openInstance.id),
    );
    const initialProgramInstanceDetail =
      detail && detail.organizationId === workspace.organizationId ? detail : null;
    return { programInstances, initialProgramInstanceDetail };
  };

  if (activeTab === 'overview') {
    const [
      cardHeader,
      clinicalBundle,
      notes,
      tasks,
      programActivity,
      appointments,
      programBundle,
      portalState,
      supportPolicy,
      packagesRaw,
      exerciseCalendarDays,
      messagesSnapshot,
    ] = await Promise.all([
      cardHeaderPromise,
      loadClinicalBundle(),
      deps.doctorNotes.listForUser(patientUserId),
      specialistTasksRead.ok
        ? deps.specialistTasks.listPatientTasks(session.user.userId, patientUserId, false)
        : Promise.resolve([]),
      loadDoctorPatientProgramActivity(
        { programItemDiscussion: deps.programItemDiscussion },
        {
          patientUserId,
          viewerUserId: session.user.userId,
          organizationId: workspace.organizationId,
        },
      ),
      deps.doctorClientsPort.listPatientAppointments(patientUserId, workspace.organizationId),
      loadProgramBundle(),
      withDoctorWorkspacePrincipal(workspace, () =>
        deps.patientInvites.getPortalStatus(workspace.organizationId, patientUserId),
      ),
      deps.doctorClients.getPatientProgramInteractionPolicy(patientUserId).catch(
        (): PatientProgramInteractionPolicy | null => null,
      ),
      membershipAccess.specialistNavigation && deps.memberships
        ? deps.memberships
            .listPatientPackagesForUser(patientUserId, workspace.organizationId)
            .catch(() => null)
        : Promise.resolve(null),
      loadDoctorPatientExerciseCalendar(
        deps,
        workspace,
        patientUserId,
        currentPatientExerciseCalendarMonthRange(),
      ),
      withDoctorWorkspacePrincipal(workspace, () =>
        loadDoctorPatientMessagesSnapshot(deps, patientUserId, workspace.organizationId),
      ),
    ]);

    const { programInstances, initialProgramInstanceDetail } = programBundle;

    return {
      ...membershipMeta,
      cardHeader,
      ...nullTabData,
      initialClinicalState: clinicalBundle.clinicalState,
      initialVisits: clinicalBundle.visits,
      initialNotes: notes,
      initialTasks: tasks,
      initialProgramActivity: programActivity,
      initialAppointments: appointments,
      initialProgramInstances: programInstances,
      initialPortalState: portalState,
      initialSupportEffectivePolicy: supportPolicy,
      initialPackages: shapePackages(packagesRaw),
      initialExerciseCalendarDays: exerciseCalendarDays,
      initialMessagesSnapshot: messagesSnapshot,
      initialProgramInstanceDetail,
    };
  }

  if (activeTab === 'karta') {
    const [cardHeader, clinicalBundle, anamnesis, comorbidities] = await Promise.all([
      cardHeaderPromise,
      loadClinicalBundle(),
      withDoctorWorkspacePrincipal(workspace, () => deps.patientClinical.getAnamnesis(patientUserId)),
      withDoctorWorkspacePrincipal(workspace, () =>
        deps.patientComorbidities.listActive(patientUserId),
      ),
    ]);
    return {
      ...membershipMeta,
      cardHeader,
      ...nullTabData,
      initialClinicalState: clinicalBundle.clinicalState,
      initialVisits: clinicalBundle.visits,
      initialAnamnesis: anamnesis,
      initialComorbidities: comorbidities,
    };
  }

  if (activeTab === 'program') {
    const [cardHeader, programInstances] = await Promise.all([
      cardHeaderPromise,
      loadProgramInstances(),
    ]);
    return {
      ...membershipMeta,
      cardHeader,
      ...nullTabData,
      initialProgramInstances: programInstances,
    };
  }

  if (activeTab === 'records') {
    const [cardHeader, appointments, packagesRaw, paymentsSummary] = await Promise.all([
      cardHeaderPromise,
      deps.doctorClientsPort.listPatientAppointments(patientUserId, workspace.organizationId),
      membershipAccess.specialistNavigation && deps.memberships
        ? deps.memberships
            .listPatientPackagesForUser(patientUserId, workspace.organizationId)
            .catch(() => null)
        : Promise.resolve(null),
      withDoctorWorkspacePrincipal(workspace, () =>
        deps.patientPayments.listPaymentsWithSummary(patientUserId),
      ),
    ]);
    const patientPaymentRows = paymentsSummary.payments;
    return {
      ...membershipMeta,
      cardHeader,
      ...nullTabData,
      initialAppointments: appointments,
      initialPackages: shapePackages(packagesRaw),
      initialPaymentsSummary: {
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
      },
    };
  }

  if (activeTab === 'files') {
    const [cardHeader, fileRecords] = await Promise.all([
      cardHeaderPromise,
      withDoctorWorkspacePrincipal(workspace, () => deps.patientFiles.listFiles(patientUserId)),
    ]);
    return {
      ...membershipMeta,
      cardHeader,
      ...nullTabData,
      initialFiles: fileRecords.map((f) => ({ ...f, previewUrl: null })),
    };
  }

  if (activeTab === 'account') {
    const [cardHeader, rawContactRows, portalState] = await Promise.all([
      cardHeaderPromise,
      deps.platformUserContacts.listForPlatformUser(patientUserId),
      withDoctorWorkspacePrincipal(workspace, () =>
        deps.patientInvites.getPortalStatus(workspace.organizationId, patientUserId),
      ),
    ]);
    const initialSupplementaryContacts = cardHeader
      ? toDoctorSupplementaryContacts(rawContactRows, {
          phone: cardHeader.identity.phone,
          email: cardHeader.identity.email,
        })
      : rawContactRows.map((r) => ({
          id: r.id,
          contactType: r.contactType,
          value: r.value,
          source: r.source,
        }));
    return {
      ...membershipMeta,
      cardHeader,
      ...nullTabData,
      initialSupplementaryContacts,
      initialPortalState: portalState,
    };
  }

  if (activeTab === 'comms') {
    const [cardHeader, programInstances] = await Promise.all([
      cardHeaderPromise,
      loadProgramInstances(),
    ]);
    return {
      ...membershipMeta,
      cardHeader,
      ...nullTabData,
      initialProgramInstances: programInstances,
    };
  }

  if (activeTab === 'finances') {
    const [cardHeader, paymentsSummary, appointments, packagesRaw, historyEvents] = await Promise.all([
      cardHeaderPromise,
      withDoctorWorkspacePrincipal(workspace, () =>
        deps.patientPayments.listPaymentsWithSummary(patientUserId),
      ),
      deps.doctorClientsPort.listPatientAppointments(patientUserId, workspace.organizationId),
      membershipAccess.specialistNavigation && deps.memberships
        ? deps.memberships
            .listPatientPackagesForUser(patientUserId, workspace.organizationId)
            .catch(() => null)
        : Promise.resolve(null),
      deps.payments
        ? deps.payments
            .listPaymentHistoryForUser(patientUserId, workspace.organizationId)
            .catch(() => [])
        : Promise.resolve([]),
    ]);
    const patientPaymentRows = paymentsSummary.payments;
    const finances = buildFinancesTimeline(patientPaymentRows, historyEvents);
    return {
      ...membershipMeta,
      cardHeader,
      ...nullTabData,
      initialAppointments: appointments,
      initialPackages: shapePackages(packagesRaw),
      initialFinancesData: finances,
    };
  }

  const cardHeader = await cardHeaderPromise;
  return { ...membershipMeta, cardHeader, ...nullTabData };
}

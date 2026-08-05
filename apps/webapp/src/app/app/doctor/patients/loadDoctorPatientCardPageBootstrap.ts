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
  currentPatientExerciseCalendarMonthRangeInIana,
  loadDoctorPatientExerciseCalendar,
  type DoctorPatientExerciseCalendarSnapshot,
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

export type BootstrapEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: 'load_failed' };

export function envelopeFromSettled<T>(result: PromiseSettledResult<T>): BootstrapEnvelope<T> {
  if (result.status === 'fulfilled') return { ok: true, value: result.value };
  return { ok: false, error: 'load_failed' };
}

type Deps = ReturnType<typeof buildAppDeps>;

export type DoctorPatientCardShellMeta = {
  activeTab: PatientCardTabId;
  membershipMutationAllowed: boolean;
  membershipsVisible: boolean;
  specialistTasksAvailable: boolean;
  specialistTasksReadable: boolean;
  cardHeader: Awaited<ReturnType<Deps['doctorClients']['getPatientCardHeader']>>;
};

export type DoctorPatientCardTabBootstrap = {
  initialClinicalState: BootstrapEnvelope<
    Awaited<ReturnType<Deps['patientClinical']['getClinicalState']>>
  > | null;
  initialVisits: BootstrapEnvelope<Awaited<ReturnType<Deps['patientClinical']['listVisits']>>> | null;
  initialNotes: BootstrapEnvelope<Awaited<ReturnType<Deps['doctorNotes']['listForUser']>>> | null;
  initialTasks: BootstrapEnvelope<
    Awaited<ReturnType<Deps['specialistTasks']['listPatientTasks']>>
  > | null;
  initialProgramActivity: BootstrapEnvelope<
    Awaited<ReturnType<typeof loadDoctorPatientProgramActivity>>
  > | null;
  initialAppointments: BootstrapEnvelope<
    Awaited<ReturnType<Deps['doctorClientsPort']['listPatientAppointments']>>
  > | null;
  initialProgramInstances: BootstrapEnvelope<
    Awaited<ReturnType<Deps['treatmentProgramInstance']['listForPatientClinicalView']>>
  > | null;
  initialFiles:
    | BootstrapEnvelope<
        Array<
          Awaited<ReturnType<Deps['patientFiles']['listFiles']>>[number] & { previewUrl: null }
        >
      >
    | null;
  initialAnamnesis: BootstrapEnvelope<
    Awaited<ReturnType<Deps['patientClinical']['getAnamnesis']>>
  > | null;
  initialComorbidities: BootstrapEnvelope<
    Awaited<ReturnType<Deps['patientComorbidities']['listActive']>>
  > | null;
  initialFinancesData: BootstrapEnvelope<{
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
  }> | null;
  initialSupplementaryContacts: BootstrapEnvelope<
    Awaited<ReturnType<typeof toDoctorSupplementaryContacts>>
  > | null;
  initialPackages: BootstrapEnvelope<
    Array<{
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
    }>
  > | null;
  initialPaymentsSummary: BootstrapEnvelope<{
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
  }> | null;
  initialSupportEffectivePolicy: BootstrapEnvelope<PatientProgramInteractionPolicy | null> | null;
  initialPortalState: BootstrapEnvelope<
    Awaited<ReturnType<Deps['patientInvites']['getPortalStatus']>>
  > | null;
  initialExerciseCalendarSnapshot: BootstrapEnvelope<DoctorPatientExerciseCalendarSnapshot> | null;
  initialMessagesSnapshot: BootstrapEnvelope<
    Awaited<ReturnType<typeof loadDoctorPatientMessagesSnapshot>>
  > | null;
  initialProgramInstanceDetail: BootstrapEnvelope<TreatmentProgramInstanceDetail | null> | null;
};

/** @deprecated Combined bootstrap — prefer shell meta + tab bootstrap for progressive load. */
export type DoctorPatientCardPageBootstrap = DoctorPatientCardShellMeta &
  DoctorPatientCardTabBootstrap;

const NULL_TAB_BOOTSTRAP: DoctorPatientCardTabBootstrap = {
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
  initialExerciseCalendarSnapshot: null,
  initialMessagesSnapshot: null,
  initialProgramInstanceDetail: null,
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

async function loadMembershipMeta(
  workspace: DoctorWorkspaceAccessContext,
  activeTab: PatientCardTabId,
) {
  const membershipAccess = await getMechanicSurfaceVisibility(workspace, 'subscriptions');
  const membershipMutation = membershipAccess.specialistNavigation
    ? await getMechanicMutationAvailability(workspace, 'subscriptions')
    : { available: false as const };
  const specialistTasksAvailability = await getMechanicMutationAvailability(
    workspace,
    'specialist_tasks',
  );
  const specialistTasksRead = await requireEntitlementForReadAction(workspace, 'specialist_tasks');

  return {
    activeTab,
    membershipMutationAllowed: membershipMutation.available,
    membershipsVisible: membershipAccess.specialistNavigation,
    specialistTasksAvailable: specialistTasksAvailability.available,
    specialistTasksReadable: specialistTasksRead.ok,
    membershipAccess,
  };
}

export async function loadDoctorPatientCardShellMeta(
  deps: Deps,
  workspace: DoctorWorkspaceAccessContext,
  patientUserId: string,
  activeTab: PatientCardTabId,
): Promise<DoctorPatientCardShellMeta> {
  const [membershipMeta, cardHeader] = await Promise.all([
    loadMembershipMeta(workspace, activeTab),
    deps.doctorClients.getPatientCardHeader(patientUserId),
  ]);

  return {
    activeTab: membershipMeta.activeTab,
    membershipMutationAllowed: membershipMeta.membershipMutationAllowed,
    membershipsVisible: membershipMeta.membershipsVisible,
    specialistTasksAvailable: membershipMeta.specialistTasksAvailable,
    specialistTasksReadable: membershipMeta.specialistTasksReadable,
    cardHeader,
  };
}

export async function loadDoctorPatientCardTabBootstrap(
  deps: Deps,
  workspace: DoctorWorkspaceAccessContext,
  patientUserId: string,
  activeTab: PatientCardTabId,
): Promise<DoctorPatientCardTabBootstrap> {
  const session = workspace.session;
  const membershipMeta = await loadMembershipMeta(workspace, activeTab);
  const { membershipAccess, specialistTasksReadable } = membershipMeta;

  const loadClinicalState = () =>
    withDoctorWorkspacePrincipal(workspace, () =>
      deps.patientClinical.getClinicalState(patientUserId),
    );

  const loadVisits = () =>
    withDoctorWorkspacePrincipal(workspace, () => deps.patientClinical.listVisits(patientUserId));

  const loadProgramInstances = () =>
    withDoctorWorkspacePrincipal(workspace, () =>
      deps.treatmentProgramInstance.listForPatientClinicalView(patientUserId),
    ).then((instances) =>
      instances.filter((instance) => instance.organizationId === workspace.organizationId),
    );

  const loadProgramInstanceDetail = async () => {
    const programInstances = await loadProgramInstances();
    const openInstance = pickOpenTreatmentProgramInstance(programInstances);
    if (!openInstance) return null;
    const detail = await withDoctorWorkspacePrincipal(workspace, () =>
      deps.treatmentProgramInstance.getInstanceById(openInstance.id),
    );
    return detail && detail.organizationId === workspace.organizationId ? detail : null;
  };

  if (activeTab === 'overview') {
    const [
      clinicalStateResult,
      visitsResult,
      notesResult,
      tasksResult,
      programActivityResult,
      appointmentsResult,
      programInstancesResult,
      programInstanceDetailResult,
      portalStateResult,
      supportPolicyResult,
      packagesResult,
      exerciseCalendarResult,
      messagesSnapshotResult,
    ] = await Promise.allSettled([
      loadClinicalState(),
      loadVisits(),
      deps.doctorNotes.listForUser(patientUserId),
      specialistTasksReadable
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
      loadProgramInstances(),
      loadProgramInstanceDetail(),
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
      (async () => {
        const patientIana =
          (await deps.patientCalendarTimezone.getIanaForUser(patientUserId)) ?? 'UTC';
        return loadDoctorPatientExerciseCalendar(
          deps,
          workspace,
          patientUserId,
          currentPatientExerciseCalendarMonthRangeInIana(patientIana),
        );
      })(),
      withDoctorWorkspacePrincipal(workspace, () =>
        loadDoctorPatientMessagesSnapshot(deps, patientUserId, workspace.organizationId),
      ),
    ]);

    const packagesValue =
      packagesResult.status === 'fulfilled' ? shapePackages(packagesResult.value) : null;

    return {
      ...NULL_TAB_BOOTSTRAP,
      initialClinicalState: envelopeFromSettled(clinicalStateResult),
      initialVisits: envelopeFromSettled(visitsResult),
      initialNotes: envelopeFromSettled(notesResult),
      initialTasks: envelopeFromSettled(tasksResult),
      initialProgramActivity: envelopeFromSettled(programActivityResult),
      initialAppointments: envelopeFromSettled(appointmentsResult),
      initialProgramInstances: envelopeFromSettled(programInstancesResult),
      initialProgramInstanceDetail: envelopeFromSettled(programInstanceDetailResult),
      initialPortalState: envelopeFromSettled(portalStateResult),
      initialSupportEffectivePolicy:
        supportPolicyResult.status === 'fulfilled'
          ? { ok: true, value: supportPolicyResult.value }
          : { ok: false, error: 'load_failed' },
      initialPackages:
        packagesResult.status === 'fulfilled'
          ? { ok: true, value: packagesValue ?? [] }
          : { ok: false, error: 'load_failed' },
      initialExerciseCalendarSnapshot: envelopeFromSettled(exerciseCalendarResult),
      initialMessagesSnapshot: envelopeFromSettled(messagesSnapshotResult),
    };
  }

  if (activeTab === 'karta') {
    const [clinicalStateResult, visitsResult, anamnesisResult, comorbiditiesResult] =
      await Promise.allSettled([
        loadClinicalState(),
        loadVisits(),
        withDoctorWorkspacePrincipal(workspace, () =>
          deps.patientClinical.getAnamnesis(patientUserId),
        ),
        withDoctorWorkspacePrincipal(workspace, () =>
          deps.patientComorbidities.listActive(patientUserId),
        ),
      ]);

    return {
      ...NULL_TAB_BOOTSTRAP,
      initialClinicalState: envelopeFromSettled(clinicalStateResult),
      initialVisits: envelopeFromSettled(visitsResult),
      initialAnamnesis: envelopeFromSettled(anamnesisResult),
      initialComorbidities: envelopeFromSettled(comorbiditiesResult),
    };
  }

  if (activeTab === 'program') {
    const programInstancesResult = await Promise.allSettled([loadProgramInstances()]);
    return {
      ...NULL_TAB_BOOTSTRAP,
      initialProgramInstances: envelopeFromSettled(programInstancesResult[0]!),
    };
  }

  if (activeTab === 'records') {
    const [appointmentsResult, packagesResult, paymentsSummaryResult] = await Promise.allSettled([
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

    const paymentsSummary =
      paymentsSummaryResult.status === 'fulfilled' ? paymentsSummaryResult.value : null;
    const patientPaymentRows = paymentsSummary?.payments ?? [];

    return {
      ...NULL_TAB_BOOTSTRAP,
      initialAppointments: envelopeFromSettled(appointmentsResult),
      initialPackages:
        packagesResult.status === 'fulfilled'
          ? { ok: true, value: shapePackages(packagesResult.value) ?? [] }
          : { ok: false, error: 'load_failed' },
      initialPaymentsSummary:
        paymentsSummaryResult.status === 'fulfilled' && paymentsSummary
          ? {
              ok: true,
              value: {
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
            }
          : { ok: false, error: 'load_failed' },
    };
  }

  if (activeTab === 'files') {
    const fileRecordsResult = await Promise.allSettled([
      withDoctorWorkspacePrincipal(workspace, () => deps.patientFiles.listFiles(patientUserId)),
    ]);
    const files =
      fileRecordsResult[0]?.status === 'fulfilled'
        ? fileRecordsResult[0].value.map((f) => ({ ...f, previewUrl: null }))
        : null;
    return {
      ...NULL_TAB_BOOTSTRAP,
      initialFiles:
        fileRecordsResult[0]?.status === 'fulfilled' && files
          ? { ok: true, value: files }
          : { ok: false, error: 'load_failed' },
    };
  }

  if (activeTab === 'account') {
    const [rawContactRowsResult, portalStateResult] = await Promise.allSettled([
      deps.platformUserContacts.listForPlatformUser(patientUserId),
      withDoctorWorkspacePrincipal(workspace, () =>
        deps.patientInvites.getPortalStatus(workspace.organizationId, patientUserId),
      ),
    ]);
    const cardHeader = await deps.doctorClients.getPatientCardHeader(patientUserId);
    const rawContactRows =
      rawContactRowsResult.status === 'fulfilled' ? rawContactRowsResult.value : null;
    const initialSupplementaryContacts = rawContactRows
      ? cardHeader
        ? toDoctorSupplementaryContacts(rawContactRows, {
            phone: cardHeader.identity.phone,
            email: cardHeader.identity.email,
          })
        : rawContactRows.map((r) => ({
            id: r.id,
            contactType: r.contactType,
            value: r.value,
            source: r.source,
          }))
      : null;

    return {
      ...NULL_TAB_BOOTSTRAP,
      initialSupplementaryContacts:
        rawContactRowsResult.status === 'fulfilled' && initialSupplementaryContacts
          ? { ok: true, value: initialSupplementaryContacts }
          : { ok: false, error: 'load_failed' },
      initialPortalState: envelopeFromSettled(portalStateResult),
    };
  }

  if (activeTab === 'comms') {
    const programInstancesResult = await Promise.allSettled([loadProgramInstances()]);
    return {
      ...NULL_TAB_BOOTSTRAP,
      initialProgramInstances: envelopeFromSettled(programInstancesResult[0]!),
    };
  }

  if (activeTab === 'finances') {
    const [paymentsSummaryResult, appointmentsResult, packagesResult, historyEventsResult] =
      await Promise.allSettled([
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

    const paymentsSummary =
      paymentsSummaryResult.status === 'fulfilled' ? paymentsSummaryResult.value : null;
    const historyEvents =
      historyEventsResult.status === 'fulfilled' ? historyEventsResult.value : [];
    const patientPaymentRows = paymentsSummary?.payments ?? [];
    const finances =
      paymentsSummaryResult.status === 'fulfilled' && paymentsSummary
        ? buildFinancesTimeline(patientPaymentRows, historyEvents)
        : null;

    return {
      ...NULL_TAB_BOOTSTRAP,
      initialAppointments: envelopeFromSettled(appointmentsResult),
      initialPackages:
        packagesResult.status === 'fulfilled'
          ? { ok: true, value: shapePackages(packagesResult.value) ?? [] }
          : { ok: false, error: 'load_failed' },
      initialFinancesData:
        finances != null ? { ok: true, value: finances } : { ok: false, error: 'load_failed' },
    };
  }

  return { ...NULL_TAB_BOOTSTRAP };
}

export function unwrapBootstrapEnvelope<T>(
  envelope: BootstrapEnvelope<T> | null | undefined,
): T | null {
  if (!envelope?.ok) return null;
  return envelope.value;
}

export function isBootstrapEnvelopeFailed(
  envelope: BootstrapEnvelope<unknown> | null | undefined,
): boolean {
  return envelope != null && !envelope.ok;
}

export async function loadDoctorPatientCardPageBootstrap(
  deps: Deps,
  workspace: DoctorWorkspaceAccessContext,
  patientUserId: string,
  activeTab: PatientCardTabId,
): Promise<DoctorPatientCardPageBootstrap> {
  const [shellMeta, tabBootstrap] = await Promise.all([
    loadDoctorPatientCardShellMeta(deps, workspace, patientUserId, activeTab),
    loadDoctorPatientCardTabBootstrap(deps, workspace, patientUserId, activeTab),
  ]);
  return { ...shellMeta, ...tabBootstrap };
}

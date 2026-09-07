import type { AppointmentSummary } from '@/modules/appointments/service';
import type { ChannelCard } from '@/modules/channel-preferences/types';
import type {
  LfkComplex,
  LfkSession,
  SymptomEntry,
  SymptomTracking,
} from '@/modules/diaries/types';
import type { DoctorSupplementaryContact } from '@/modules/platform-user-contacts/bookingContactUpsert';
import type {
  DoctorClientsFilters,
  DoctorClientsPort,
  PatientCardEncounterProjectionOptions,
  PatientCardHeader,
} from './ports';
import type { ClientIdentity, ClientListItem, PatientProgramInteractionPolicy } from './ports';
import type { ClientChannelPolicy, ClientSupportProfile } from './supportPolicy';
import { resolveClientChannelPolicy } from './supportPolicy';
import {
  defaultDoctorWorkspaceClientDefaults,
  type DoctorWorkspaceClientDefaults,
} from '@/modules/system-settings/doctorWorkspaceComposition';
import { countCancellations30d, lastVisitLabelFromHistory } from './appointmentStatsFromHistory';
import { clientChannelDeliveryContext } from './clientChannelDeliveryContext';

/** Строка истории записей на приём из canonical doctor/client read model. */
export type ClientAppointmentHistoryItem = {
  id: string;
  recordAt: string | null;
  status: string;
  label: string;
  lastEvent: string;
  updatedAt: string;
  /** Optional schedule source marker for compatibility/import provenance. */
  scheduleProvenancePrefix?: string;
};

export type ClientProfile = {
  identity: ClientIdentity;
  supplementaryContacts: DoctorSupplementaryContact[];
  channelCards: ChannelCard[];
  upcomingAppointments: AppointmentSummary[];
  /** История по телефону клиента (не удалённые записи). */
  appointmentHistory: ClientAppointmentHistoryItem[];
  appointmentStats: {
    total: number;
    cancellations30d: number;
    lastVisitLabel: string | null;
    nextVisitLabel: string | null;
  };
  symptomTrackings: SymptomTracking[];
  recentSymptomEntries: SymptomEntry[];
  lfkComplexes: LfkComplex[];
  recentLfkSessions: LfkSession[];
};

export type DoctorClientsServiceDeps = {
  clientsPort: DoctorClientsPort;
  getUpcomingAppointments: (userId: string) => AppointmentSummary[] | Promise<AppointmentSummary[]>;
  /** История записей по нормализованному телефону. */
  listAppointmentHistoryForPhone: (
    phoneNormalized: string | null,
  ) => Promise<ClientAppointmentHistoryItem[]>;
  listSymptomTrackings: (userId: string, activeOnly?: boolean) => Promise<SymptomTracking[]>;
  listSymptomEntries: (userId: string, limit?: number) => Promise<SymptomEntry[]>;
  listLfkComplexes: (userId: string, activeOnly?: boolean) => Promise<LfkComplex[]>;
  listLfkSessions: (userId: string, limit?: number) => Promise<LfkSession[]>;
  getChannelCards: (
    userId: string,
    bindings: ClientIdentity['bindings'],
    delivery?: { phone?: string | null; emailVerified?: boolean },
  ) => Promise<ChannelCard[]>;
  listSupplementaryContacts: (
    userId: string,
    identity: ClientIdentity,
  ) => Promise<DoctorSupplementaryContact[]>;
  getDoctorWorkspaceClientDefaults?: (
    context: { organizationId: string },
  ) => Promise<DoctorWorkspaceClientDefaults>;
  /** Compatibility seam for older service consumers while the structured row is absent. */
  getDoctorSupportDefault?: (
    key:
      | 'doctor_patient_support_comments_without_support_default_enabled'
      | 'doctor_patient_support_media_without_support_default_enabled',
    context: { patientUserId: string; organizationId: string },
  ) => Promise<boolean>;
};

export function createDoctorClientsService(deps: DoctorClientsServiceDeps) {
  async function getClientDefaults(
    patientUserId: string | null,
    context: { organizationId: string },
  ): Promise<DoctorWorkspaceClientDefaults> {
    if (deps.getDoctorWorkspaceClientDefaults) {
      return deps.getDoctorWorkspaceClientDefaults(context);
    }
    const runtimeContext = { patientUserId: patientUserId ?? '', ...context };
    const [commentsEnabled, mediaEnabled] = await Promise.all([
      deps.getDoctorSupportDefault?.(
        'doctor_patient_support_comments_without_support_default_enabled',
        runtimeContext,
      ) ?? false,
      deps.getDoctorSupportDefault?.(
        'doctor_patient_support_media_without_support_default_enabled',
        runtimeContext,
      ) ?? false,
    ]);
    return defaultDoctorWorkspaceClientDefaults({
      legacyCommentsWithoutSupportEnabled: commentsEnabled,
      legacyMediaWithoutSupportEnabled: mediaEnabled,
    });
  }

  return {
    async listClients(
      filters: DoctorClientsFilters,
      audience?: { excludedUserIds?: string[] },
    ): Promise<ClientListItem[]> {
      return deps.clientsPort.listClients(filters, audience);
    },

    async getClientProfile(userId: string): Promise<ClientProfile | null> {
      const identity = await deps.clientsPort.getClientIdentity(userId);
      if (!identity) return null;

      const [
        channelCards,
        supplementaryContacts,
        upcomingAppointments,
        appointmentHistory,
        symptomTrackings,
        recentSymptomEntries,
        lfkComplexes,
        recentLfkSessions,
      ] = await Promise.all([
        deps.getChannelCards(userId, identity.bindings, clientChannelDeliveryContext(identity)),
        deps.listSupplementaryContacts(userId, identity),
        Promise.resolve(deps.getUpcomingAppointments(userId)),
        deps.listAppointmentHistoryForPhone(identity.phone),
        deps.listSymptomTrackings(userId, true),
        deps.listSymptomEntries(userId, 20),
        deps.listLfkComplexes(userId, true),
        deps.listLfkSessions(userId, 20),
      ]);

      const appointments = Array.isArray(upcomingAppointments) ? upcomingAppointments : [];
      const nextLabel = appointments.length > 0 ? appointments[0].label : null;
      const nowMs = Date.now();

      return {
        identity,
        supplementaryContacts,
        channelCards,
        upcomingAppointments: appointments,
        appointmentHistory,
        appointmentStats: {
          total: appointments.length,
          cancellations30d: countCancellations30d(appointmentHistory, nowMs),
          lastVisitLabel: lastVisitLabelFromHistory(appointmentHistory, nowMs),
          nextVisitLabel: nextLabel,
        },
        symptomTrackings,
        recentSymptomEntries,
        lfkComplexes,
        recentLfkSessions,
      };
    },

    async getClientSupport(
      patientUserId: string,
      organizationId: string,
    ): Promise<ClientSupportProfile | null> {
      return deps.clientsPort.getClientSupport(patientUserId, organizationId);
    },

    async updateClientSupport(params: {
      patientUserId: string;
      organizationId: string;
      onSupport?: boolean;
      commentsEnabled?: boolean | null;
      mediaEnabled?: boolean | null;
      directChatEnabled?: boolean | null;
      actorId: string;
    }): Promise<ClientSupportProfile> {
      return deps.clientsPort.updateClientSupport(params);
    },

    async getPatientCardHeader(
      userId: string,
      organizationId: string,
      options?: PatientCardEncounterProjectionOptions,
    ): Promise<PatientCardHeader | null> {
      return deps.clientsPort.getPatientCardHeader(userId, organizationId, options);
    },

    async setPatientBirthDate(
      userId: string,
      organizationId: string,
      birthDate: string | null,
    ): Promise<void> {
      return deps.clientsPort.setPatientBirthDate(userId, organizationId, birthDate);
    },

    async setPatientGender(
      userId: string,
      organizationId: string,
      gender: 'male' | 'female' | null,
    ): Promise<void> {
      return deps.clientsPort.setPatientGender(userId, organizationId, gender);
    },

    async setPatientNames(
      userId: string,
      names: { firstName?: string | null; lastName?: string | null; patronymic?: string | null },
    ): Promise<void> {
      return deps.clientsPort.setPatientNames(userId, names);
    },

    async getPatientPhysical(
      userId: string,
      organizationId: string,
    ): Promise<{ heightCm: number | null; weightKg: number | null } | null> {
      return deps.clientsPort.getPatientPhysical(userId, organizationId);
    },

    async setPatientPhysical(
      userId: string,
      organizationId: string,
      params: { heightCm?: number | null; weightKg?: number | null },
    ): Promise<void> {
      return deps.clientsPort.setPatientPhysical(userId, organizationId, params);
    },

    async getClientChannelPolicy(
      patientUserId: string | null,
      context: { organizationId: string },
    ): Promise<ClientChannelPolicy> {
      const [profile, defaults] = await Promise.all([
        patientUserId
          ? deps.clientsPort.getClientSupport(patientUserId, context.organizationId)
          : Promise.resolve(null),
        getClientDefaults(patientUserId, context),
      ]);
      if (profile && profile.organizationId !== context.organizationId) {
        throw new Error('support_profile_organization_mismatch');
      }
      return resolveClientChannelPolicy({ profile, defaults: defaults.channelDefaults });
    },

    async filterPatientUserIdsByClientChannel(
      patientUserIds: readonly string[],
      context: { organizationId: string },
      channel: keyof ClientChannelPolicy,
    ): Promise<Set<string>> {
      const defaults = await getClientDefaults(null, context);
      const uniquePatientUserIds = Array.from(new Set(patientUserIds));
      const profiles = await Promise.all(
        uniquePatientUserIds.map((patientUserId) =>
          deps.clientsPort.getClientSupport(patientUserId, context.organizationId),
        ),
      );
      return new Set(
        uniquePatientUserIds.filter((patientUserId, index) => {
          const profile = profiles[index] ?? null;
          if (profile && profile.organizationId !== context.organizationId) {
            throw new Error('support_profile_organization_mismatch');
          }
          return resolveClientChannelPolicy({ profile, defaults: defaults.channelDefaults })[channel];
        }),
      );
    },

    async getPatientProgramInteractionPolicy(
      patientUserId: string,
      context: { organizationId: string },
    ): Promise<PatientProgramInteractionPolicy> {
      const [profile, channelPolicy] = await Promise.all([
        deps.clientsPort.getClientSupport(patientUserId, context.organizationId),
        this.getClientChannelPolicy(patientUserId, context),
      ]);
      return {
        organizationId: context.organizationId,
        onSupport: profile?.onSupport ?? false,
        commentsAllowed: channelPolicy.commentsAllowed,
        mediaAllowed: channelPolicy.mediaAllowed,
      };
    },
  };
}

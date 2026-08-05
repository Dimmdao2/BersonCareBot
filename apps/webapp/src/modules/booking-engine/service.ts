import { assertValidAppointmentStatusTransition } from './appointmentStatusFsm';
import type {
  BookingEngineCorePort,
  BookingEnginePort,
  OrganizationCatalogPort,
  OrganizationPort,
  ServiceAvailabilityPort,
} from './ports';
import type {
  AppointmentStatus,
  CreateAppointmentInput,
  CreateManualPatientVisitInput,
  TransitionAppointmentStatusInput,
} from './types';
import { resolveBookingLocationPalette } from './locationPalette';
import { isReservedOnlineLocationIdentity, setBuiltInOnlineLocationState } from './onlineLocation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONLINE_SLOT_MINUTE_MS = 60_000;
const MAX_ONLINE_CHAIN_MINUTES = 8 * 60;

function assertUuid(id: string, label = 'id'): void {
  if (!UUID_RE.test(id.trim())) throw new Error(`Некорректный UUID: ${label}`);
}

function assertAppointmentStatus(s: string): asserts s is AppointmentStatus {
  const statuses: readonly string[] = [
    'created',
    'awaiting_payment',
    'paid',
    'confirmed',
    'rescheduled',
    'cancelled_by_patient',
    'cancelled_by_specialist',
    'late_cancellation',
    'no_show',
    'completed',
    'visit_confirmed',
    'charged_to_package',
    'manual_review_required',
  ];
  if (!statuses.includes(s)) throw new Error('Неизвестный статус записи');
}

type BookingEngineServiceDependencies = {
  getLocationPaletteSetting?: () => Promise<unknown>;
  /**
   * 3.2: physically refuses a mechanic write unless a passing mutation decision already ran in
   * this request (injected from `buildAppDeps.ts` as `assertMechanicWriteClearance`).
   */
  assertWriteClearance?: (mechanic: 'branches' | 'booking') => void;
};

export function createBookingEngineService(
  port: BookingEngineCorePort,
  dependencies: BookingEngineServiceDependencies = {},
) {
  const engine: BookingEnginePort = {
    async getSpecialistAppointmentReminderSettings(input) {
      assertUuid(input.organizationId, 'organizationId');
      assertUuid(input.specialistId, 'specialistId');
      return port.getSpecialistAppointmentReminderSettings(input);
    },

    async updateSpecialistAppointmentReminderSettings(input) {
      assertUuid(input.organizationId, 'organizationId');
      assertUuid(input.specialistId, 'specialistId');
      return port.updateSpecialistAppointmentReminderSettings(input);
    },

    async setPatientAppointmentReminderPreset(input) {
      assertUuid(input.appointmentId, 'appointmentId');
      return port.setPatientAppointmentReminderPreset(input);
    },

    async getPatientAppointmentReminderPreference(appointmentId) {
      assertUuid(appointmentId, 'appointmentId');
      return port.getPatientAppointmentReminderPreference(appointmentId);
    },

    async getAppointment(id) {
      assertUuid(id);
      return port.getAppointment(id);
    },

    async listAppointmentsByChainId(input) {
      assertUuid(input.organizationId, 'organizationId');
      assertUuid(input.chainId, 'chainId');
      return port.listAppointmentsByChainId(input);
    },

    async getStatusBeforePackageCharge(appointmentId) {
      assertUuid(appointmentId, 'appointmentId');
      return port.getStatusBeforePackageCharge(appointmentId);
    },

    async createAppointment(input: CreateAppointmentInput) {
      assertUuid(input.organizationId, 'organizationId');
      const status = input.status ?? 'created';
      assertAppointmentStatus(status);
      if (new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()) {
        throw new Error('Время окончания должно быть позже начала');
      }
      return port.createAppointment({ ...input, status });
    },

    async createOnlineAppointmentsIfAvailable(inputs: CreateAppointmentInput[]) {
      if (inputs.length < 1) throw new Error('appointment_chain_required');
      const normalized = inputs.map((input) => {
        assertUuid(input.organizationId, 'organizationId');
        if (input.branchId || input.roomId || input.specialistId || input.serviceId) {
          throw new Error('online_appointment_context_required');
        }
        const status = input.status ?? 'created';
        assertAppointmentStatus(status);
        const startMs = new Date(input.startAt).getTime();
        const endMs = new Date(input.endAt).getTime();
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
          throw new Error('Время окончания должно быть позже начала');
        }
        if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
          throw new Error('invalid_appointment_duration');
        }
        if (startMs % ONLINE_SLOT_MINUTE_MS !== 0 || endMs % ONLINE_SLOT_MINUTE_MS !== 0) {
          throw new Error('online_slot_minute_alignment_required');
        }
        if (endMs - startMs !== input.durationMinutes * ONLINE_SLOT_MINUTE_MS) {
          throw new Error('invalid_appointment_duration');
        }
        return {
          ...input,
          branchId: null,
          roomId: null,
          specialistId: null,
          serviceId: null,
          startAt: new Date(startMs).toISOString(),
          endAt: new Date(endMs).toISOString(),
          status,
        };
      });
      const organizationId = normalized[0]!.organizationId;
      for (let index = 0; index < normalized.length; index += 1) {
        const current = normalized[index]!;
        if (current.organizationId !== organizationId)
          throw new Error('appointment_chain_organization_mismatch');
        if (index > 0 && current.startAt !== normalized[index - 1]!.endAt) {
          throw new Error('appointment_chain_not_consecutive');
        }
      }
      const totalMinutes =
        (new Date(normalized.at(-1)!.endAt).getTime() -
          new Date(normalized[0]!.startAt).getTime()) /
        ONLINE_SLOT_MINUTE_MS;
      if (totalMinutes > MAX_ONLINE_CHAIN_MINUTES)
        throw new Error('online_appointment_range_too_large');
      return port.createOnlineAppointmentsIfAvailable(normalized);
    },

    async createManualPatientVisit(input: CreateManualPatientVisitInput) {
      assertUuid(input.organizationId, 'organizationId');
      assertUuid(input.commandId, 'commandId');
      if (input.kind === 'walk_in') {
        assertUuid(input.walkIn.specialistId, 'specialistId');
        const visitedAtMs = new Date(input.walkIn.visitedAt).getTime();
        if (Number.isNaN(visitedAtMs)) {
          throw new Error('invalid_visit_time');
        }
        if (visitedAtMs > Date.now() + 2 * 60_000) throw new Error('visit_in_future');
        return port.createManualPatientVisit(input);
      }
      const status = input.appointment.status ?? 'confirmed';
      assertAppointmentStatus(status);
      if (
        new Date(input.appointment.endAt).getTime() <= new Date(input.appointment.startAt).getTime()
      ) {
        throw new Error('Время окончания должно быть позже начала');
      }
      return port.createManualPatientVisit({
        ...input,
        appointment: { ...input.appointment, status },
      });
    },

    async createAppointmentChain(inputs: CreateAppointmentInput[]) {
      if (inputs.length < 1) throw new Error('appointment_chain_required');
      for (const input of inputs) {
        assertUuid(input.organizationId, 'organizationId');
        const status = input.status ?? 'created';
        assertAppointmentStatus(status);
        if (new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()) {
          throw new Error('Время окончания должно быть позже начала');
        }
      }
      return port.createAppointmentChain(
        inputs.map((input) => ({ ...input, status: input.status ?? 'created' })),
      );
    },

    async transitionAppointmentStatus(input: TransitionAppointmentStatusInput) {
      assertUuid(input.appointmentId, 'appointmentId');
      assertAppointmentStatus(input.toStatus);
      const current = await port.getAppointment(input.appointmentId);
      if (!current) throw new Error('Запись не найдена');
      assertValidAppointmentStatusTransition(current.status, input.toStatus);
      return port.transitionAppointmentStatus(input);
    },

    async deleteAppointmentHard(input: { organizationId: string; appointmentId: string }) {
      assertUuid(input.organizationId, 'organizationId');
      assertUuid(input.appointmentId, 'appointmentId');
      if (!port.deleteAppointmentHard) return false;
      return port.deleteAppointmentHard(input);
    },
  };

  return {
    ...engine,
    organization: createOrganizationFacade(port),
    catalog: createCatalogFacade(port, dependencies),
    services: createServiceAvailabilityFacade(port, dependencies),
  };
}

function createOrganizationFacade(port: OrganizationPort) {
  return {
    getDefaultOrganizationId: () => port.getDefaultOrganizationId(),
    getOrganization: (id: string) => {
      assertUuid(id);
      return port.getOrganization(id);
    },
    listOrganizations: () => port.listOrganizations(),
    upsertOrganization: port.upsertOrganization.bind(port),
  };
}

function createCatalogFacade(
  port: OrganizationCatalogPort,
  dependencies: BookingEngineServiceDependencies,
) {
  function assertBranchesWriteClearance(): void {
    dependencies.assertWriteClearance?.('branches');
  }

  function assertBookingWriteClearance(): void {
    dependencies.assertWriteClearance?.('booking');
  }

  async function locationPalette() {
    const stored = dependencies.getLocationPaletteSetting
      ? await dependencies.getLocationPaletteSetting()
      : null;
    return resolveBookingLocationPalette(stored);
  }

  return {
    listBranches: (organizationId: string) => {
      assertUuid(organizationId);
      return port.listBranches(organizationId);
    },
    getBranch: (id: string) => {
      assertUuid(id);
      return port.getBranch(id);
    },
    async upsertBranch(
      input: Parameters<OrganizationCatalogPort['upsertBranch']>[0],
    ) {
      if (!isReservedOnlineLocationIdentity(input)) {
        assertBranchesWriteClearance();
      }
      return port.upsertBranch(input);
    },
    async createPhysicalBranch(
      input: Omit<
        Parameters<OrganizationCatalogPort['createPhysicalBranchWithDefaultColor']>[0],
        'physicalPalette'
      >,
    ) {
      assertBranchesWriteClearance();
      const palette = await locationPalette();
      return port.createPhysicalBranchWithDefaultColor({
        ...input,
        physicalPalette: palette.physicalPalette,
      });
    },
    async setOnlineLocationState(input: {
      organizationId: string;
      isActive: boolean;
      colorOverride?: string;
    }) {
      const palette = await locationPalette();
      return setBuiltInOnlineLocationState(port, { ...input, defaultColor: palette.online });
    },
    async deactivateBranch(id: string) {
      assertBranchesWriteClearance();
      return port.deactivateBranch(id);
    },
    listRooms: port.listRooms.bind(port),
    getRoom: port.getRoom.bind(port),
    async upsertRoom(input: Parameters<OrganizationCatalogPort['upsertRoom']>[0]) {
      assertBookingWriteClearance();
      return port.upsertRoom(input);
    },
    async deactivateRoom(id: string) {
      assertBookingWriteClearance();
      return port.deactivateRoom(id);
    },
    listSpecialists: port.listSpecialists.bind(port),
    getSpecialist: port.getSpecialist.bind(port),
    async upsertSpecialist(input: Parameters<OrganizationCatalogPort['upsertSpecialist']>[0]) {
      assertBookingWriteClearance();
      return port.upsertSpecialist(input);
    },
    async deactivateSpecialist(id: string) {
      assertBookingWriteClearance();
      return port.deactivateSpecialist(id);
    },
    async setSpecialistLocation(
      input: Parameters<OrganizationCatalogPort['setSpecialistLocation']>[0],
    ) {
      assertBookingWriteClearance();
      return port.setSpecialistLocation(input);
    },
    async setSpecialistRoom(input: Parameters<OrganizationCatalogPort['setSpecialistRoom']>[0]) {
      assertBookingWriteClearance();
      return port.setSpecialistRoom(input);
    },
    listSpecialistRooms: port.listSpecialistRooms.bind(port),
  };
}

function createServiceAvailabilityFacade(
  port: ServiceAvailabilityPort,
  dependencies: BookingEngineServiceDependencies,
) {
  function assertBookingWriteClearance(): void {
    dependencies.assertWriteClearance?.('booking');
  }

  return {
    listServices: port.listServices.bind(port),
    getService: port.getService.bind(port),
    async upsertService(
      input: Parameters<ServiceAvailabilityPort['upsertService']>[0],
    ) {
      assertBookingWriteClearance();
      return port.upsertService(input);
    },
    async deactivateService(id: string) {
      assertBookingWriteClearance();
      return port.deactivateService(id);
    },
    async upsertSpecialistServiceAvailability(
      input: Parameters<ServiceAvailabilityPort['upsertSpecialistServiceAvailability']>[0],
    ) {
      assertBookingWriteClearance();
      return port.upsertSpecialistServiceAvailability(input);
    },
    listSpecialistServiceAvailability: port.listSpecialistServiceAvailability.bind(port),
    async deactivateSpecialistServiceAvailability(id: string) {
      assertBookingWriteClearance();
      return port.deactivateSpecialistServiceAvailability(id);
    },
    async upsertServiceLocationAvailability(
      input: Parameters<ServiceAvailabilityPort['upsertServiceLocationAvailability']>[0],
    ) {
      assertBookingWriteClearance();
      return port.upsertServiceLocationAvailability(input);
    },
    async setSoloServiceLocationAvailability(
      input: Parameters<ServiceAvailabilityPort['setSoloServiceLocationAvailability']>[0],
    ) {
      assertBookingWriteClearance();
      return port.setSoloServiceLocationAvailability(input);
    },
    listServiceLocationAvailability: port.listServiceLocationAvailability.bind(port),
  };
}

import { assertValidAppointmentStatusTransition } from "./appointmentStatusFsm";
import type {
  BookingEngineBundlePort,
  BookingEnginePort,
  OrganizationCatalogPort,
  OrganizationPort,
  RubitimeBridgePort,
  ServiceAvailabilityPort,
} from "./ports";
import type { AppointmentStatus, CreateAppointmentInput, TransitionAppointmentStatusInput } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(id: string, label = "id"): void {
  if (!UUID_RE.test(id.trim())) throw new Error(`Некорректный UUID: ${label}`);
}

function assertAppointmentStatus(s: string): asserts s is AppointmentStatus {
  const statuses: readonly string[] = [
    "created",
    "awaiting_payment",
    "paid",
    "confirmed",
    "rescheduled",
    "cancelled_by_patient",
    "cancelled_by_specialist",
    "late_cancellation",
    "no_show",
    "completed",
    "visit_confirmed",
    "charged_to_package",
    "manual_review_required",
  ];
  if (!statuses.includes(s)) throw new Error("Неизвестный статус записи");
}

export function createBookingEngineService(port: BookingEngineBundlePort) {
  const engine: BookingEnginePort = {
    async getAppointment(id) {
      assertUuid(id);
      return port.getAppointment(id);
    },

    async listAppointmentsByChainId(input) {
      assertUuid(input.organizationId, "organizationId");
      assertUuid(input.chainId, "chainId");
      return port.listAppointmentsByChainId(input);
    },

    async getRubitimeAppointmentId(input) {
      assertUuid(input.organizationId, "organizationId");
      assertUuid(input.appointmentId, "appointmentId");
      if (!port.getRubitimeAppointmentId) return null;
      return port.getRubitimeAppointmentId(input);
    },

    async getAppointmentIdByRubitimeExternalId(input) {
      assertUuid(input.organizationId, "organizationId");
      const rubitimeId = input.rubitimeId.trim();
      if (!rubitimeId) return null;
      if (!port.getAppointmentIdByRubitimeExternalId) return null;
      return port.getAppointmentIdByRubitimeExternalId({ organizationId: input.organizationId, rubitimeId });
    },

    async getStatusBeforePackageCharge(appointmentId) {
      assertUuid(appointmentId, "appointmentId");
      return port.getStatusBeforePackageCharge(appointmentId);
    },

    async createAppointment(input: CreateAppointmentInput) {
      assertUuid(input.organizationId, "organizationId");
      const status = input.status ?? "created";
      assertAppointmentStatus(status);
      if (new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()) {
        throw new Error("Время окончания должно быть позже начала");
      }
      return port.createAppointment({ ...input, status });
    },

    async createAppointmentChain(inputs: CreateAppointmentInput[]) {
      if (inputs.length < 1) throw new Error("appointment_chain_required");
      for (const input of inputs) {
        assertUuid(input.organizationId, "organizationId");
        const status = input.status ?? "created";
        assertAppointmentStatus(status);
        if (new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()) {
          throw new Error("Время окончания должно быть позже начала");
        }
      }
      return port.createAppointmentChain(inputs.map((input) => ({ ...input, status: input.status ?? "created" })));
    },

    async transitionAppointmentStatus(input: TransitionAppointmentStatusInput) {
      assertUuid(input.appointmentId, "appointmentId");
      assertAppointmentStatus(input.toStatus);
      const current = await port.getAppointment(input.appointmentId);
      if (!current) throw new Error("Запись не найдена");
      assertValidAppointmentStatusTransition(current.status, input.toStatus);
      return port.transitionAppointmentStatus(input);
    },

    async deleteAppointmentHard(input: { organizationId: string; appointmentId: string }) {
      assertUuid(input.organizationId, "organizationId");
      assertUuid(input.appointmentId, "appointmentId");
      if (!port.deleteAppointmentHard) return false;
      return port.deleteAppointmentHard(input);
    },

    async upsertRubitimeAppointmentMapping(input) {
      assertUuid(input.organizationId, "organizationId");
      assertUuid(input.appointmentId, "appointmentId");
      if (!input.rubitimeId.trim()) throw new Error("rubitime_id_required");
      return port.upsertRubitimeAppointmentMapping(input);
    },
  };

  return {
    ...engine,
    organization: createOrganizationFacade(port),
    catalog: createCatalogFacade(port),
    services: createServiceAvailabilityFacade(port),
    bridge: createBridgeFacade(port),
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

function createCatalogFacade(port: OrganizationCatalogPort) {
  return {
    listBranches: (organizationId: string) => {
      assertUuid(organizationId);
      return port.listBranches(organizationId);
    },
    getBranch: (id: string) => {
      assertUuid(id);
      return port.getBranch(id);
    },
    upsertBranch: port.upsertBranch.bind(port),
    deactivateBranch: port.deactivateBranch.bind(port),
    listRooms: port.listRooms.bind(port),
    getRoom: port.getRoom.bind(port),
    upsertRoom: port.upsertRoom.bind(port),
    deactivateRoom: port.deactivateRoom.bind(port),
    listSpecialists: port.listSpecialists.bind(port),
    getSpecialist: port.getSpecialist.bind(port),
    upsertSpecialist: port.upsertSpecialist.bind(port),
    deactivateSpecialist: port.deactivateSpecialist.bind(port),
    setSpecialistLocation: port.setSpecialistLocation.bind(port),
    setSpecialistRoom: port.setSpecialistRoom.bind(port),
    listSpecialistRooms: port.listSpecialistRooms.bind(port),
  };
}

function createServiceAvailabilityFacade(port: ServiceAvailabilityPort) {
  return {
    listServices: port.listServices.bind(port),
    getService: port.getService.bind(port),
    upsertService: port.upsertService.bind(port),
    deactivateService: port.deactivateService.bind(port),
    upsertSpecialistServiceAvailability: port.upsertSpecialistServiceAvailability.bind(port),
    listSpecialistServiceAvailability: port.listSpecialistServiceAvailability.bind(port),
    deactivateSpecialistServiceAvailability: port.deactivateSpecialistServiceAvailability.bind(port),
    upsertServiceLocationAvailability: port.upsertServiceLocationAvailability.bind(port),
    setSoloServiceLocationAvailability: port.setSoloServiceLocationAvailability.bind(port),
    listServiceLocationAvailability: port.listServiceLocationAvailability.bind(port),
  };
}

function createBridgeFacade(port: RubitimeBridgePort) {
  const emptyProjection = {
    projectedAppointments: 0,
    updatedAppointments: 0,
    skippedExisting: 0,
    recoveredMappings: 0,
  };

  return {
    isBridgeEnabled: () => port.isBridgeEnabled(),
    projectAll: async (organizationId: string) => {
      assertUuid(organizationId);
      const enabled = await port.isBridgeEnabled();
      if (!enabled) {
        return { appointmentRecords: emptyProjection };
      }
      const appointmentRecords = await port.projectAppointmentRecords(organizationId);
      return { appointmentRecords };
    },
    getMappingSummary: (organizationId: string) => {
      assertUuid(organizationId);
      return port.getMappingSummary(organizationId);
    },
  };
}

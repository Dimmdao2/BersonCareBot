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

    async createAppointment(input: CreateAppointmentInput) {
      assertUuid(input.organizationId, "organizationId");
      const status = input.status ?? "created";
      assertAppointmentStatus(status);
      if (new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()) {
        throw new Error("Время окончания должно быть позже начала");
      }
      return port.createAppointment({ ...input, status });
    },

    async transitionAppointmentStatus(input: TransitionAppointmentStatusInput) {
      assertUuid(input.appointmentId, "appointmentId");
      assertAppointmentStatus(input.toStatus);
      const current = await port.getAppointment(input.appointmentId);
      if (!current) throw new Error("Запись не найдена");
      assertValidAppointmentStatusTransition(current.status, input.toStatus);
      return port.transitionAppointmentStatus(input);
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
    listServiceLocationAvailability: port.listServiceLocationAvailability.bind(port),
  };
}

function createBridgeFacade(port: RubitimeBridgePort) {
  return {
    isBridgeEnabled: () => port.isBridgeEnabled(),
    projectAll: async (organizationId: string) => {
      assertUuid(organizationId);
      const enabled = await port.isBridgeEnabled();
      if (!enabled) {
        return {
          appointmentRecords: { projectedAppointments: 0, skippedExisting: 0 },
          rubitimeRecords: { projectedAppointments: 0, skippedExisting: 0 },
        };
      }
      const appointmentRecords = await port.projectAppointmentRecords(organizationId);
      const rubitimeRecords = await port.projectRubitimeRecords(organizationId);
      return { appointmentRecords, rubitimeRecords };
    },
    getMappingSummary: (organizationId: string) => {
      assertUuid(organizationId);
      return port.getMappingSummary(organizationId);
    },
  };
}

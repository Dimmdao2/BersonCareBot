import type { RubitimeBridgePort } from "@/modules/booking-rubitime-bridge/ports";
import type {
  AppointmentStatus,
  BeAppointment,
  BeBranch,
  BeClinicService,
  BeOrganization,
  BeRoom,
  BeServiceLocationAvailability,
  BeSpecialist,
  BeSpecialistServiceAvailability,
  CreateAppointmentInput,
  TransitionAppointmentStatusInput,
} from "./types";

export type { RubitimeBridgePort } from "@/modules/booking-rubitime-bridge/ports";

export type OrganizationPort = {
  getDefaultOrganizationId(): Promise<string>;
  getOrganization(id: string): Promise<BeOrganization | null>;
  listOrganizations(): Promise<BeOrganization[]>;
  upsertOrganization(input: { id?: string; title: string; isActive: boolean; sortOrder: number }): Promise<BeOrganization>;
};

export type OrganizationCatalogPort = {
  listBranches(organizationId: string): Promise<BeBranch[]>;
  getBranch(id: string): Promise<BeBranch | null>;
  upsertBranch(input: {
    organizationId: string;
    id?: string;
    title: string;
    cityCode: string;
    address?: string | null;
    timezone?: string;
    isActive: boolean;
    sortOrder: number;
  }): Promise<BeBranch>;
  deactivateBranch(id: string): Promise<boolean>;

  listRooms(organizationId: string, branchId?: string): Promise<BeRoom[]>;
  getRoom(id: string): Promise<BeRoom | null>;
  upsertRoom(input: {
    organizationId: string;
    branchId: string;
    id?: string;
    title: string;
    isActive: boolean;
    sortOrder: number;
  }): Promise<BeRoom>;
  deactivateRoom(id: string): Promise<boolean>;

  listSpecialists(organizationId: string): Promise<BeSpecialist[]>;
  getSpecialist(id: string): Promise<BeSpecialist | null>;
  upsertSpecialist(input: {
    organizationId: string;
    id?: string;
    fullName: string;
    description?: string | null;
    isActive: boolean;
    sortOrder: number;
  }): Promise<BeSpecialist>;
  deactivateSpecialist(id: string): Promise<boolean>;

  setSpecialistLocation(input: {
    organizationId: string;
    specialistId: string;
    branchId: string;
    isActive: boolean;
  }): Promise<void>;

  setSpecialistRoom(input: {
    organizationId: string;
    specialistId: string;
    roomId: string;
    isActive: boolean;
  }): Promise<void>;

  listSpecialistRooms(organizationId: string): Promise<
    { id: string; specialistId: string; roomId: string; isActive: boolean }[]
  >;
};

export type ServiceAvailabilityPort = {
  listServices(organizationId: string): Promise<BeClinicService[]>;
  getService(id: string): Promise<BeClinicService | null>;
  upsertService(input: {
    organizationId: string;
    id?: string;
    title: string;
    description?: string | null;
    durationMinutes: number;
    priceMinor: number;
    isActive: boolean;
    prepaymentApplicable: boolean;
    usableInPackages: boolean;
    onlinePaymentApplicable: boolean;
    publicWidgetVisible: boolean;
    adminManualOnly: boolean;
    sortOrder: number;
  }): Promise<BeClinicService>;
  deactivateService(id: string): Promise<boolean>;

  upsertSpecialistServiceAvailability(input: {
    organizationId: string;
    specialistId: string;
    serviceId: string;
    branchId?: string | null;
    roomId?: string | null;
    cityCode?: string | null;
    durationMinutesOverride?: number | null;
    priceMinorOverride?: number | null;
    isActive: boolean;
    sortOrder: number;
  }): Promise<BeSpecialistServiceAvailability>;
  listSpecialistServiceAvailability(organizationId: string): Promise<BeSpecialistServiceAvailability[]>;
  deactivateSpecialistServiceAvailability(id: string): Promise<boolean>;

  upsertServiceLocationAvailability(input: {
    organizationId: string;
    serviceId: string;
    branchId: string;
    isActive: boolean;
  }): Promise<BeServiceLocationAvailability>;
  listServiceLocationAvailability(organizationId: string): Promise<BeServiceLocationAvailability[]>;
};

export type BookingEnginePort = {
  getAppointment(id: string): Promise<BeAppointment | null>;
  /** Status immediately before transition to `charged_to_package` (for package refund revert). */
  getStatusBeforePackageCharge(appointmentId: string): Promise<AppointmentStatus | null>;
  createAppointment(input: CreateAppointmentInput): Promise<BeAppointment>;
  transitionAppointmentStatus(input: TransitionAppointmentStatusInput): Promise<BeAppointment>;
  upsertRubitimeAppointmentMapping(input: {
    organizationId: string;
    appointmentId: string;
    rubitimeId: string;
  }): Promise<void>;
};

export type BookingEngineCorePort = OrganizationPort &
  OrganizationCatalogPort &
  ServiceAvailabilityPort &
  BookingEnginePort;

export type BookingEngineBundlePort = BookingEngineCorePort & RubitimeBridgePort;

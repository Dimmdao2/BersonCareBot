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
  CreateManualPatientVisitInput,
  CreateManualPatientVisitResult,
  TransitionAppointmentStatusInput,
} from './types';
import type {
  AppointmentReminderSpecialistSettings,
  AppointmentReminderPresetId,
} from '@/modules/booking-notifications/appointmentReminderPresets';

export type OrganizationPort = {
  getDefaultOrganizationId(): Promise<string>;
  getOrganization(id: string): Promise<BeOrganization | null>;
  listOrganizations(): Promise<BeOrganization[]>;
  upsertOrganization(input: {
    id?: string;
    title: string;
    isActive: boolean;
    sortOrder: number;
  }): Promise<BeOrganization>;
};

export type OrganizationCatalogPort = {
  listBranches(organizationId: string): Promise<BeBranch[]>;
  getBranch(id: string): Promise<BeBranch | null>;
  upsertBranch(input: {
    organizationId: string;
    id?: string;
    title: string;
    /** Short display name (e.g. «СПб»). Optional; when omitted, existing value is preserved. */
    shortTitle?: string | null;
    /** Hex color. Optional; when omitted, existing value is preserved. */
    color?: string | null;
    cityCode: string;
    address?: string | null;
    timezone?: string;
    isActive: boolean;
    sortOrder: number;
  }): Promise<BeBranch>;
  /** Creates a physical branch and assigns its server-owned default color atomically. */
  createPhysicalBranchWithDefaultColor(input: {
    organizationId: string;
    title: string;
    shortTitle?: string | null;
    cityCode: string;
    address?: string | null;
    timezone?: string;
    isActive: boolean;
    sortOrder: number;
    physicalPalette: readonly string[];
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

  listSpecialistRooms(
    organizationId: string,
  ): Promise<{ id: string; specialistId: string; roomId: string; isActive: boolean }[]>;
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
    bufferAfterMinutes: number;
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
    priceMinorOverride?: number | null;
    isActive: boolean;
    sortOrder: number;
  }): Promise<BeSpecialistServiceAvailability>;
  listSpecialistServiceAvailability(
    organizationId: string,
  ): Promise<BeSpecialistServiceAvailability[]>;
  deactivateSpecialistServiceAvailability(id: string): Promise<boolean>;

  upsertServiceLocationAvailability(input: {
    organizationId: string;
    serviceId: string;
    branchId: string;
    isActive: boolean;
  }): Promise<BeServiceLocationAvailability>;
  /** Atomically normalizes the solo UI's location and default-specialist rows. */
  setSoloServiceLocationAvailability(input: {
    organizationId: string;
    specialistId: string;
    serviceId: string;
    branchId: string;
    isActive: boolean;
  }): Promise<{
    locationAvailability: BeServiceLocationAvailability;
    specialistAvailability: BeSpecialistServiceAvailability;
  }>;
  listServiceLocationAvailability(organizationId: string): Promise<BeServiceLocationAvailability[]>;
};

export type BookingEnginePort = {
  getSpecialistAppointmentReminderSettings(input: {
    organizationId: string;
    specialistId: string;
  }): Promise<AppointmentReminderSpecialistSettings | null>;
  updateSpecialistAppointmentReminderSettings(input: {
    organizationId: string;
    specialistId: string;
    settings: AppointmentReminderSpecialistSettings;
  }): Promise<boolean>;
  setPatientAppointmentReminderPreset(input: {
    appointmentId: string;
    presetId: AppointmentReminderPresetId | null;
  }): Promise<boolean>;
  getPatientAppointmentReminderPreference(appointmentId: string): Promise<{
    organizationId: string;
    status: AppointmentStatus;
    allowedPresetIds: string[];
    presetId: string | null;
    selectionSource: 'specialist_default' | 'patient';
  } | null>;
  getAppointment(id: string): Promise<BeAppointment | null>;
  /** Chain rows are ordered by their zero-based position. */
  listAppointmentsByChainId(input: {
    organizationId: string;
    chainId: string;
  }): Promise<BeAppointment[]>;
  /** Status immediately before transition to `charged_to_package` (for package refund revert). */
  getStatusBeforePackageCharge(appointmentId: string): Promise<AppointmentStatus | null>;
  createAppointment(input: CreateAppointmentInput): Promise<BeAppointment>;
  /** Range-locks, rechecks and inserts a legacy online/null-capacity chain in one transaction. */
  createOnlineAppointmentsIfAvailable(inputs: CreateAppointmentInput[]): Promise<BeAppointment[]>;
  /** Staff new-patient identity, invited relationship and scheduled visit in one transaction. */
  createManualPatientVisit(
    input: CreateManualPatientVisitInput,
  ): Promise<CreateManualPatientVisitResult>;
  /** Inserts every appointment in a consecutive chain in one transaction. */
  createAppointmentChain(inputs: CreateAppointmentInput[]): Promise<BeAppointment[]>;
  transitionAppointmentStatus(input: TransitionAppointmentStatusInput): Promise<BeAppointment>;
  /** Hard delete is used only for immediate create rollback before side-effects. */
  deleteAppointmentHard?(input: {
    organizationId: string;
    appointmentId: string;
  }): Promise<boolean>;
};

export type BookingEngineCorePort = OrganizationPort &
  OrganizationCatalogPort &
  ServiceAvailabilityPort &
  BookingEnginePort;

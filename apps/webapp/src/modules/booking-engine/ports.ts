import type {
  AppointmentStatus,
  BeAppointment,
  BeBranch,
  BeClinicService,
  BeOrganization,
  BeRoom,
  BeServiceDoerIntersection,
  BeSpecialist,
  BeSpecialistServiceAvailability,
  CreateAppointmentInput,
  CreateManualPatientVisitInput,
  CreateManualPatientVisitResult,
  TransitionAppointmentStatusInput,
  UpdateAppointmentFinancialSnapshotInput,
  AppointmentFinancialSnapshotRecord,
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
    avatarMediaId?: string | null;
    fullDescriptionMarkdown?: string | null;
    cardIsPublished?: boolean;
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
  /**
   * Услуги филиала, которые анонимному посетителю позволено записать. Отбор («активна», «видна в
   * публичном виджете», «не только для администратора», «назначена активному специалисту в этом
   * филиале») делает дверь публичного каталога в SQL — здесь его повторять нельзя, иначе появятся
   * две реализации одного правила. Вне принципала публичной записи метод отказывает.
   */
  listPublicBookableServicesForBranch(input: {
    organizationId: string;
    branchId: string;
  }): Promise<BeClinicService[]>;
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

  /**
   * Единственная точка записи пары «специалист × услуга × филиал»: и клиника, и соло-экран
   * сужения пишут сюда (§5 «Один общий проход»). Сводит точные исторические дубли (room/city
   * обнуляемые) к одной строке — иначе выключенная галка остаётся видна публично через
   * забытый активный дубль.
   */
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

  /**
   * Пересечения «услуга × специалист × филиал», в которых услуга сегодня действительно делается —
   * ровно тем отбором, каким её отдаёт публичная дверь записи. Кабинету это нужно, чтобы не
   * предлагать включить услугу, которую никто не оказывает, и чтобы честно подписать такую
   * строку (#1102 §2.1, §2.4).
   */
  listServiceDoerIntersections(organizationId: string): Promise<BeServiceDoerIntersection[]>;
  /**
   * Соло: услуга привязана к соло-специалисту во всех его активных филиалах без единого клика
   * (#1102 §1.1, дословно владелец: «Ему вообще нигде себя выбирать не надо»). Дописывает только
   * НЕДОСТАЮЩИЕ пары и никогда не трогает существующие строки — экран «Доступность услуг по
   * филиалам» остаётся для того, кто хочет сузить вручную, и его выключенная галка не воскресает.
   *
   * `serviceId` / `branchId` сужают пересчёт до только что появившейся услуги или локации; без
   * них покрывается вся организация. Возвращает число созданных строк.
   */
  ensureSoloServiceCoverage(input: {
    organizationId: string;
    specialistId: string;
    serviceId?: string;
    branchId?: string;
  }): Promise<number>;
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
    allowedPresetIds: AppointmentReminderPresetId[];
    presetId: AppointmentReminderPresetId | null;
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
  /**
   * PAY-APPT-02/03/12: ЕДИНСТВЕННЫЙ путь переписывания финансового снимка уже существующей
   * записи. Отказывает, если деньги уже состоялись (`prepayment_paid_minor > 0` либо есть
   * `payment_ref`), — проверка стоит внутри той же транзакции, а не только у вызывающего.
   * `prepayment_paid_minor` этим путём не пишется никогда.
   */
  updateAppointmentFinancialSnapshot(
    input: UpdateAppointmentFinancialSnapshotInput,
  ): Promise<BeAppointment>;
  /** PAY-APPT-06: снимок предоплаты набором — карточка деталей открывается из уже прочитанного диапазона. */
  listAppointmentFinancialSnapshots(
    organizationId: string,
    appointmentIds: string[],
  ): Promise<AppointmentFinancialSnapshotRecord[]>;
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

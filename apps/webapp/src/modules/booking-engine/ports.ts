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

/**
 * Публичная личность специалиста, названного в ссылке `/{clinic}/booking?specialist=<id>`
 * (#926 §17.C).
 *
 * Наружу выходит ровно имя: остальное про человека публикует визитка, а не мастер записи. Филиалы
 * здесь потому, что первый экран сужается до тех, где он ДЕЙСТВИТЕЛЬНО принимает (план §6.2), —
 * без этого ссылка «к Анне» уводит в филиал, где под неё нет ни одной услуги.
 */
export type PublicBookableSpecialist = {
  id: string;
  fullName: string;
  branchIds: string[];
  /**
   * Можно ли из модуля записи открыть его карточку и прочитать описание (#926 §17.Q, решение
   * владельца 11.09: «Просто галочка есть показывать? Показываем, нет галочки, не показываем»).
   *
   * Готовый ответ двери, а не два флага: в него уже сведены галка организации и собственная
   * публикация специалиста. Второго её прочтения в приложении нет.
   */
  cardIsReadable: boolean;
};

export type OrganizationCatalogPort = {
  listBranches(organizationId: string): Promise<BeBranch[]>;
  getBranch(id: string): Promise<BeBranch | null>;
  /**
   * Кто стоит за `?specialist=<id>` — под принципалом ПУБЛИЧНОЙ записи, а не кабинета.
   *
   * `null` одинаково значит «несуществующий», «чужой» и «неактивный» (§3.3): различать эти причины
   * наружу нельзя, иначе по форме ответа перебираются люди. Отбор — только `is_active`: решение
   * владельца 11.09 вывело `card_is_published` из мастера записи вовсе (§17.Q), потому что по
   * свежей ссылке он объявлял «больше не принимает записи» о человеке, который их принимает.
   * Предикат живёт в теле двери, второй его записи в приложении нет. Вне принципала публичной
   * записи метод отказывает.
   */
  resolvePublicBookableSpecialist(input: {
    organizationId: string;
    specialistId: string;
  }): Promise<PublicBookableSpecialist | null>;
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
   *
   * `specialistId` — та же дверь с тем же вопросом, только суженным до одного специалиста
   * (#926 §17.C): «что здесь можно записать» и «что здесь можно записать к нему» — один вход с
   * параметром, а не два (§5 «Один общий проход»). Неопубликованный или чужой специалист даёт
   * пустой список, а не полный каталог.
   */
  listPublicBookableServicesForBranch(input: {
    organizationId: string;
    branchId: string;
    specialistId?: string | null;
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

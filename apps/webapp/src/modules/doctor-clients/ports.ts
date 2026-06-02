import type { ChannelBindings } from "@/shared/types/session";
import type { ClientSupportProfile, PatientProgramInteractionPolicy } from "./supportPolicy";

/** Фильтры для списка клиентов специалиста. */
export type DoctorClientsFilters = {
  search?: string;
  hasUpcomingAppointment?: boolean;
  /** Есть хотя бы одна активная назначенная программа лечения (`treatment_program_instances.status = 'active'`). */
  hasActiveTreatmentProgram?: boolean;
  hasTelegram?: boolean;
  hasMax?: boolean;
  /** Только пользователи с хотя бы одной строкой в `appointment_records` (JOIN по phone). Этап 9. */
  onlyWithAppointmentRecords?: boolean;
  /**
   * Клиенты с прошедшим слотом created/updated в текущем UTC-месяце (как плитка дашборда «Были на приёме»).
   * См. docs/ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md.
   */
  visitedThisCalendarMonth?: boolean;
  /** Только заархивированные (`is_archived`), раздел «Архив». */
  archivedOnly?: boolean;
  /** `on` — `doctor_patient_support.on_support`; `programWithoutSupport` — активная doctor-программа без сопровождения. */
  supportStatus?: "on" | "programWithoutSupport";
};

/** Строка клиента в списке. */
export type ClientListItem = {
  userId: string;
  displayName: string;
  phone: string | null;
  bindings: ChannelBindings;
  nextAppointmentLabel: string | null;
  /** Хотя бы одна строка `treatment_program_instances` со статусом `active` для этого клиента. */
  activeTreatmentProgram: boolean;
  /** Выбранный активный экземпляр (при нескольких — самый свежий по `updated_at`). Для ссылок врача на экран программы. */
  activeTreatmentProgramInstanceId: string | null;
  cancellationCount30d: number;
};

/** Базовая идентичность клиента (для профиля и агрегации). */
export type ClientIdentity = {
  userId: string;
  displayName: string;
  phone: string | null;
  bindings: ChannelBindings;
  createdAt: string | null;
  /** Этап 9: заблокирован для исходящих сообщений пациента в чат поддержки. */
  isBlocked: boolean;
  blockedReason: string | null;
  /** Архив (`platform_users.is_archived`): скрыт из обычных списков; снять архив — `PATCH .../archive` с `{ archived: false }` (врач или админ). */
  isArchived: boolean;
  /** Даты привязки каналов (`user_channel_bindings.created_at`), ключ — `channel_code`. */
  channelBindingDates: Record<string, string>;
  /** Поля `platform_users` (ФИО по частям, email); для карточки клиента и admin-редактирования. */
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  emailVerifiedAt?: string | null;
};

/** Метрики пациентов для дашборда врача (этап 9). */
export type DoctorDashboardPatientMetrics = {
  /** `COUNT(*)` WHERE `role = 'client'`. */
  totalClients: number;
  /** Клиенты с `doctor_patient_support.on_support = true`. */
  onSupportCount: number;
  /** Уникальные клиенты с прошедшим слотом created/updated в текущем UTC-месяце (`record_at < now()`). */
  visitedThisCalendarMonthCount: number;
};

export type DoctorClientsPort = {
  listClients(filters: DoctorClientsFilters): Promise<ClientListItem[]>;
  getClientIdentity(userId: string): Promise<ClientIdentity | null>;
  /** Patient-scoped doctor APIs — `role = 'client'` only; otherwise `null`. */
  getPatientClientIdentity(userId: string): Promise<ClientIdentity | null>;
  getDashboardPatientMetrics(): Promise<DoctorDashboardPatientMetrics>;
  /**
   * Клиенты, созданные за последние `days` суток, без привязок telegram/max.
   * Для KPI «Сегодня» (см. план навигации).
   */
  countRecentClientsWithoutMessagingChannels(days: number): Promise<number>;
  /** Блокировка исходящих сообщений пациента (проверка в patient messaging). */
  isClientMessagingBlocked(userId: string): Promise<boolean>;
  /** Врач/админ: установить блокировку подписчика. */
  setClientBlocked(params: {
    userId: string;
    blocked: boolean;
    reason: string | null;
    actorId: string;
  }): Promise<void>;
  /** Архив учётки клиента (скрыть из обычных списков; врач и админ через API). */
  setUserArchived(userId: string, archived: boolean): Promise<void>;
  getClientSupport(patientUserId: string): Promise<ClientSupportProfile | null>;
  updateClientSupport(params: {
    patientUserId: string;
    onSupport?: boolean;
    commentsEnabled?: boolean | null;
    mediaEnabled?: boolean | null;
    actorId: string;
  }): Promise<ClientSupportProfile>;
};

export type { ClientSupportProfile, PatientProgramInteractionPolicy } from "./supportPolicy";

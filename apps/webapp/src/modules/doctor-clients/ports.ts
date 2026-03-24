import type { ChannelBindings } from "@/shared/types/session";

/** Фильтры для списка клиентов специалиста. */
export type DoctorClientsFilters = {
  search?: string;
  hasUpcomingAppointment?: boolean;
  hasTelegram?: boolean;
  hasMax?: boolean;
  /** Только пользователи с хотя бы одной строкой в `appointment_records` (JOIN по phone). Этап 9. */
  onlyWithAppointmentRecords?: boolean;
};

/** Строка клиента в списке. */
export type ClientListItem = {
  userId: string;
  displayName: string;
  phone: string | null;
  bindings: ChannelBindings;
  nextAppointmentLabel: string | null;
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
  /** Soft-delete учётки (только админ). */
  isArchived: boolean;
};

/** Метрики пациентов для дашборда врача (этап 9). */
export type DoctorDashboardPatientMetrics = {
  /** `COUNT(*)` WHERE `role = 'client'`. */
  totalClients: number;
  /** Есть хотя бы одна будущая запись (appointment_records, created/updated). */
  onSupportCount: number;
  /** Хотя бы одна запись с `record_at` в текущем UTC-месяце (created/updated). */
  visitedThisCalendarMonthCount: number;
};

export type DoctorClientsPort = {
  listClients(filters: DoctorClientsFilters): Promise<ClientListItem[]>;
  getClientIdentity(userId: string): Promise<ClientIdentity | null>;
  getDashboardPatientMetrics(): Promise<DoctorDashboardPatientMetrics>;
  /** Блокировка исходящих сообщений пациента (проверка в patient messaging). */
  isClientMessagingBlocked(userId: string): Promise<boolean>;
  /** Врач/админ: установить блокировку подписчика. */
  setClientBlocked(params: {
    userId: string;
    blocked: boolean;
    reason: string | null;
    actorId: string;
  }): Promise<void>;
  /** Админ: архивировать учётку (скрыть из списков врача). */
  setUserArchived(userId: string, archived: boolean): Promise<void>;
};

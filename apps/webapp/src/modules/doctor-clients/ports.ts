import type { ChannelBindings } from "@/shared/types/session";
import type { ClientContactBreakdown } from "./clientContactSegments";
import type { ClientSupportProfile, PatientProgramInteractionPolicy } from "./supportPolicy";

/** Фильтры для списка клиентов специалиста. */
export type DoctorClientsFilters = {
  search?: string;
  /** Viewer user id for per-doctor read cursors (discussion unread badges). */
  viewerUserId?: string;
  hasUpcomingAppointment?: boolean;
  /** Есть хотя бы одна активная назначенная программа лечения (`treatment_program_instances.status = 'active'`). */
  hasActiveTreatmentProgram?: boolean;
  hasTelegram?: boolean;
  hasMax?: boolean;
  /** Только клиенты с email (verified). */
  hasEmail?: boolean;
  /** Только клиенты с телефоном (phone_normalized не NULL). */
  hasPhone?: boolean;
  /** Только пользователи с хотя бы одной неотменённой строкой в `appointment_records` (JOIN по phone). Этап 9. */
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
  /** Есть активный абонемент (`be_patient_packages.status IN ('active','awaiting_payment')`). */
  hasMemberships?: boolean;
  /**
   * Сегмент «Новые»: есть будущая запись, но ещё не было прошедшего посещения.
   * TODO: уточнить определение — сейчас: activeAppointmentsCount > 0 && !hasAppointmentHistory
   */
  isNew?: boolean;
  /**
   * Сегмент «Бывшие»: были посещения, но сейчас нет активной (будущей) записи.
   * TODO: уточнить определение — сейчас: hasAppointmentHistory && activeAppointmentsCount === 0
   */
  isFormer?: boolean;
  /**
   * Подписчики: есть запись в platform_users с role=client, но никогда не было записи на приём.
   * TODO: уточнить определение — сейчас: !hasAppointmentHistory && activeAppointmentsCount === 0
   */
  isSubscriberOnly?: boolean;
  /** Клиенты с хотя бы одной отменой за 30 дней. */
  hasCancellations?: boolean;
};

/** Строка клиента в списке. */
export type ClientListItem = {
  userId: string;
  displayName: string;
  /** Реальное имя (скрытое ФИО) — показывается мельче под displayName в разделе «Пациенты». */
  firstName?: string | null;
  /** Реальная фамилия (скрытое ФИО) — показывается мельче под displayName в разделе «Пациенты». */
  lastName?: string | null;
  phone: string | null;
  bindings: ChannelBindings;
  hasEmail?: boolean;
  hasApp?: boolean;
  nextAppointmentLabel: string | null;
  /** Есть хотя бы одна неотменённая запись (`appointment_records.status IN ('created', 'updated')`). */
  hasAppointmentHistory?: boolean;
  activeAppointmentsCount?: number;
  /** Хотя бы одна строка `treatment_program_instances` со статусом `active` для этого клиента. */
  activeTreatmentProgram: boolean;
  /** Выбранный активный экземпляр (при нескольких — самый свежий по `updated_at`). Для ссылок врача на экран программы. */
  activeTreatmentProgramInstanceId: string | null;
  cancellationCount30d: number;
  rescheduleCount30d?: number;
  visitedThisCalendarMonth?: boolean;
  hasConversation?: boolean;
  unreadMessagesCount?: number;
  unreadExerciseCommentsCount?: number;
  isOnSupport?: boolean;
  /** Есть активный/ожидающий оплаты абонемент пациента. */
  hasMemberships?: boolean;
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

/**
 * Агрегат шапки карточки пациента (раздел «Пациенты», карточка пациента).
 * Поля без источника данных возвращаются как null с пометкой TODO.
 */
export type PatientCardHeader = {
  /** Идентичность пациента. */
  identity: {
    userId: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    email: string | null;
    bindings: import("@/shared/types/session").ChannelBindings;
    isArchived: boolean;
    isBlocked: boolean;
    /** TODO: дата рождения — нет таблицы; потребует отдельной схемы/поля. */
    birthDate: null;
    /** TODO: возраст — вычисляется из birthDate, отсутствует до появления поля. */
    age: null;
  };
  /** Сопровождение врача. */
  support: {
    isOnSupport: boolean;
    /** Количество месяцев на сопровождении (TODO: нет точного счётчика в БД — вычисляется приблизительно). */
    supportMonthsApprox: number | null;
  };
  /** Последний визит (прошедший слот из appointment_records). */
  lastVisit: {
    date: string; // ISO date string
    /** TODO: тип визита (повторный/первичный) — нет в appointment_records; потребует поля. */
    visitType: null;
    /** TODO: город — нет в appointment_records; можно получить через booking engine, не реализовано. */
    city: null;
  } | null;
  /** Следующая запись (будущий слот из appointment_records). */
  nextAppointment: {
    date: string; // ISO date string
    time: string; // HH:MM
    /** TODO: город из appointment_records.city (если есть поле). */
    city: null;
    /** TODO: тип приёма (очный/онлайн) — нет поля. */
    appointmentType: null;
  } | null;
  /** Итого посещений (completed slots, status IN ('created','updated') && record_at < now). */
  totalVisits: number;
  /** Отмен за всё время (status='canceled' AND last_event NOT IN remove/delete). */
  cancellationsCount: number;
  /** Переносов за всё время (status='updated'). */
  reschedulesCount: number;
  /** Дата первого визита (самый ранний record_at < now). */
  firstVisitDate: string | null;
};

/** Метрики пациентов для дашборда врача (этап 9). */
export type DoctorDashboardPatientMetrics = {
  /** `COUNT(*)` WHERE `role = 'client'`. */
  totalClients: number;
  /** Клиенты с `doctor_patient_support.on_support = true`. */
  onSupportCount: number;
  /** Уникальные клиенты с прошедшим слотом created/updated в текущем UTC-месяце (`record_at < now()`). */
  visitedThisCalendarMonthCount: number;
  /** Клиенты с хотя бы одной активной программой лечения (`treatment_program_instances.status = 'active'`). */
  withProgramCount: number;
  /** Клиенты с активным/ожидающим оплаты абонементом (`be_patient_packages.status IN ('active','awaiting_payment')`). */
  membershipsCount: number;
  /** «Подписчики»: role=client, нет ни одной неотменённой записи. */
  subscriberCount: number;
  /** «Новые»: есть будущая запись, но ещё не было прошедшего посещения. */
  newCount: number;
  /** «Бывшие»: было прошедшее посещение, но нет будущей активной записи. */
  formerCount: number;
  /** Клиенты с хотя бы одной отменой за 30 дней. */
  cancellationsCount: number;
};

/** Строка в списке записей пациента (Записи таб). */
export type PatientAppointmentItem = {
  id: string;
  /** ISO timestamp момента записи. */
  dateTime: string;
  /**
   * Статус: состоялась / перенос / отмена / предстоит.
   * Маппинг: created/updated + past → 'completed'; updated + future → 'upcoming';
   * status='updated' (reschedule flag) → 'rescheduled'; status='canceled' → 'canceled'.
   */
  status: "completed" | "rescheduled" | "canceled" | "upcoming";
  /** Тип/услуга из payload_json.service_title. */
  serviceName: string | null;
  /** Локация/филиал из branches.name. */
  location: string | null;
  /** Продолжительность (мин) из payload_json.duration_minutes или null. */
  durationMin: number | null;
};

export type DoctorClientsPort = {
  listClients(
    filters: DoctorClientsFilters,
    audience?: { excludedUserIds?: string[] },
  ): Promise<ClientListItem[]>;
  /** История записей пациента по userId (прошедшие + предстоящие), новые сверху. */
  listPatientAppointments(userId: string): Promise<PatientAppointmentItem[]>;
  /**
   * Агрегат шапки карточки пациента (для нового раздела «Пациенты»).
   * Возвращает null, если пользователь не найден или не является клиентом.
   */
  getPatientCardHeader(userId: string): Promise<PatientCardHeader | null>;
  /** Сегменты контактов для аналитики `/app/doctor/analytics/clients`. */
  getClientContactBreakdown(audience?: { excludedUserIds?: string[] }): Promise<ClientContactBreakdown>;
  getClientIdentity(userId: string): Promise<ClientIdentity | null>;
  /** Patient-scoped doctor APIs — `role = 'client'` only; otherwise `null`. */
  getPatientClientIdentity(userId: string): Promise<ClientIdentity | null>;
  getDashboardPatientMetrics(audience?: { excludedUserIds?: string[] }): Promise<DoctorDashboardPatientMetrics>;
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

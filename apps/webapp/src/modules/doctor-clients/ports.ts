import type { ChannelBindings } from "@/shared/types/session";
import type { ClientContactBreakdown } from "./clientContactSegments";
import type { ClientSupportProfile, PatientProgramInteractionPolicy } from "./supportPolicy";

/** Фильтры для списка клиентов специалиста. */
export type DoctorClientsFilters = {
  search?: string;
  /** Viewer user id for per-doctor read cursors (discussion unread badges). */
  viewerUserId?: string;
  /**
   * Ограничить выборку конкретными userId (для точечных запросов без полного скана).
   * Пустой массив → немедленно вернуть [] без запроса к БД.
   * Undefined → без ограничений (все клиенты).
   */
  userIds?: string[];
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
  firstName?: string | null;
  lastName?: string | null;
  /** Отчество из platform_users.patronymic — часть ФИО, основного идентификатора пациента для врача. */
  patronymic?: string | null;
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
  /** Lifetime no-show counter from be_patient_booking_profiles.no_show_count. */
  noShowCount?: number;
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
    /** Отчество пациента из platform_users.patronymic; null если не указано. */
    patronymic: string | null;
    phone: string | null;
    email: string | null;
    bindings: import("@/shared/types/session").ChannelBindings;
    isArchived: boolean;
    isBlocked: boolean;
    /** Дата рождения из platform_users.birth_date (ISO yyyy-mm-dd), null если не задана. */
    birthDate: string | null;
    /** Возраст в полных годах, вычисляется из birthDate; null если birthDate отсутствует. */
    age: number | null;
    /** Пол пациента из platform_users.gender; null если не указан. */
    gender: "male" | "female" | null;
  };
  /** Сопровождение врача. */
  support: {
    isOnSupport: boolean;
    /** Дата начала сопровождения (doctor_patient_support.support_started_at, ISO), null если не на сопровождении. */
    startedAt: string | null;
    /** Полных месяцев на сопровождении, вычислено из startedAt; null если startedAt отсутствует. */
    supportMonthsApprox: number | null;
  };
  /** Последний визит (клинический визит из clinical_visit, либо прошедший слот из appointment_records). */
  lastVisit: {
    date: string; // ISO date string
    /** Тип визита: 'Первичный' | 'Повторный' — из clinical_visit.visit_type; null если нет клинического визита. */
    visitType: string | null;
    /** Город/локация из clinical_visit.location; null если нет клинического визита. */
    city: string | null;
  } | null;
  /** Следующая запись (будущий слот из appointment_records). */
  nextAppointment: {
    date: string; // ISO date string
    time: string; // HH:MM
    /** Город/локация — нет поля в appointment_records; null. */
    city: null;
    /** Тип приёма — нет поля в appointment_records; null. */
    appointmentType: null;
  } | null;
  /** Итого посещений (completed slots, status IN ('created','updated') && record_at < now). */
  totalVisits: number;
  /** Отмен за всё время (status='canceled' AND last_event NOT IN remove/delete). */
  cancellationsCount: number;
  /** Переносов за всё время (status='updated'). */
  reschedulesCount: number;
  /** Lifetime no-show counter from be_patient_booking_profiles.no_show_count. */
  noShowCount?: number;
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
  /**
   * Устанавливает дату рождения клиента (platform_users.birth_date).
   * Принимает ISO yyyy-mm-dd или null (сброс).
   * Работает только для клиентов (role='client').
   */
  setPatientBirthDate(userId: string, birthDate: string | null): Promise<void>;
  /**
   * Устанавливает пол клиента (platform_users.gender): 'male' | 'female' | null (сброс).
   * Работает только для клиентов (role='client').
   */
  setPatientGender(userId: string, gender: "male" | "female" | null): Promise<void>;
  /**
   * Обновляет имя клиента (platform_users.display_name / first_name / last_name).
   * Обновляются только переданные поля. displayName — непустая строка; first/last допускают null (сброс).
   * Работает только для клиентов (role='client').
   */
  setPatientNames(
    userId: string,
    names: { displayName?: string; firstName?: string | null; lastName?: string | null; patronymic?: string | null },
  ): Promise<void>;
  /**
   * Возвращает физические параметры пациента (рост/вес).
   * Null если не заданы. Возвращает null целиком если пользователь не найден или не клиент.
   */
  getPatientPhysical(userId: string): Promise<{ heightCm: number | null; weightKg: number | null } | null>;
  /**
   * Устанавливает рост и/или вес пациента (platform_users.height_cm / weight_kg).
   * Обновляются только переданные поля (null = сброс).
   * Работает только для клиентов (role='client').
   */
  setPatientPhysical(
    userId: string,
    params: { heightCm?: number | null; weightKg?: number | null },
  ): Promise<void>;
};

export type { ClientSupportProfile, PatientProgramInteractionPolicy } from "./supportPolicy";

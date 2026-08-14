import type { ChannelBindings } from '@/shared/types/session';
import type { ClientContactBreakdown } from './clientContactSegments';
import type { ClientSupportProfile, PatientProgramInteractionPolicy } from './supportPolicy';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';

/** Фильтры для списка клиентов специалиста. */
export type DoctorClientsFilters = {
  search?: string;
  /** Selected doctor workspace organization; when present, patient list and org-backed badges are scoped to it. */
  organizationId?: string;
  /** Required whenever organizationId is present; narrows ordinary doctors to linked patients. */
  visibilityActor?: PatientVisibilityActor;
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
  /** Есть серверно зафиксированная активность из PWA (`product_analytics_user_hourly.entry_channel='pwa'`). */
  hasApp?: boolean;
  /** Есть активная web-push подписка и глобальный канал web_push не выключен. */
  hasWebPush?: boolean;
  /** Только пользователи с хотя бы одной неотменённой canonical appointment. */
  onlyWithAppointmentRecords?: boolean;
  /**
   * Клиенты с прошедшим слотом created/updated в текущем UTC-месяце (как плитка дашборда «Были на приёме»).
   * См. docs/ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md.
   */
  visitedThisCalendarMonth?: boolean;
  /** Только заархивированные (`is_archived`), раздел «Архив». */
  archivedOnly?: boolean;
  /** `on` — `doctor_patient_support.on_support`; `programWithoutSupport` — активная doctor-программа без сопровождения. */
  supportStatus?: 'on' | 'programWithoutSupport';
  /** Есть действующий абонемент (`be_patient_packages.status = 'active'`). */
  hasMemberships?: boolean;
  /** Есть истёкший абонемент (`be_patient_packages.status = 'expired'`). */
  hasExpiredMemberships?: boolean;
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
  /** Клиенты с хотя бы одной отменой за всё время. */
  hasCancellations?: boolean;
  /** Клиенты с хотя бы одним переносом за всё время. */
  hasReschedules?: boolean;
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
  hasWebPush?: boolean;
  nextAppointmentLabel: string | null;
  /** Есть хотя бы одна неотменённая canonical appointment. */
  hasAppointmentHistory?: boolean;
  /** Последняя состоявшаяся non-cancelled canonical appointment в текущей organization. */
  lastAppointmentAt?: string | null;
  activeAppointmentsCount?: number;
  /** Хотя бы одна строка `treatment_program_instances` со статусом `active` для этого клиента. */
  activeTreatmentProgram: boolean;
  /** Выбранный активный экземпляр (при нескольких — самый свежий по `updated_at`). Для ссылок врача на экран программы. */
  activeTreatmentProgramInstanceId: string | null;
  /** Количество отмен за всё время по каноническим статусам отмены. */
  cancellationsCount: number;
  /** Количество переносов за всё время по `be_appointment_reschedules`. */
  reschedulesCount: number;
  /** Lifetime no-show counter from be_patient_booking_profiles.no_show_count. */
  noShowCount?: number;
  visitedThisCalendarMonth?: boolean;
  hasConversation?: boolean;
  unreadMessagesCount?: number;
  unreadExerciseCommentsCount?: number;
  isOnSupport?: boolean;
  /** Есть приобретённый абонемент: active либо awaiting_payment (client evidence / информационный индикатор). */
  hasMemberships?: boolean;
  /** Есть действующий абонемент (`status = 'active'`). */
  hasActiveMemberships?: boolean;
  /** Есть истёкший абонемент (`status = 'expired'`). */
  hasExpiredMemberships?: boolean;
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
    bindings: import('@/shared/types/session').ChannelBindings;
    /** Есть ли у пациента переписка (хотя бы одно сообщение в support_conversations),
     * независимо от привязанного канала — чтобы открыть чат даже без Telegram/MAX. */
    hasConversation: boolean;
    isArchived: boolean;
    isBlocked: boolean;
    /** Дата рождения из platform_users.birth_date (ISO yyyy-mm-dd), null если не задана. */
    birthDate: string | null;
    /** Возраст в полных годах, вычисляется из birthDate; null если birthDate отсутствует. */
    age: number | null;
    /** Пол пациента из platform_users.gender; null если не указан. */
    gender: 'male' | 'female' | null;
  };
  /** Сопровождение врача. */
  support: {
    isOnSupport: boolean;
    /** Дата начала сопровождения (doctor_patient_support.support_started_at, ISO), null если не на сопровождении. */
    startedAt: string | null;
    /** Полных месяцев на сопровождении, вычислено из startedAt; null если startedAt отсутствует. */
    supportMonthsApprox: number | null;
  };
  /** Последний визит (клинический визит из clinical_visit, либо прошедший канонический слот). */
  lastVisit: {
    date: string; // ISO date string
    /** Тип визита: 'Первичный' | 'Повторный' — из clinical_visit.visit_type; null если нет клинического визита. */
    visitType: string | null;
    /** Город/локация из clinical_visit.location; null если нет клинического визита. */
    city: string | null;
  } | null;
  /** Следующая запись (будущий канонический слот). */
  nextAppointment: {
    date: string; // ISO date string
    time: string; // HH:MM
    /** Город/локация пока не заполняется в header summary; null. */
    city: null;
    /** Тип приёма пока не заполняется в header summary; null. */
    appointmentType: null;
  } | null;
  /** Итого посещений (non-cancelled canonical slots with start_at < now). */
  totalVisits: number;
  /** Отмен за всё время по каноническим статусам отмены. */
  cancellationsCount: number;
  /** Переносов за всё время по `be_appointment_reschedules`. */
  reschedulesCount: number;
  /** Lifetime no-show counter from be_patient_booking_profiles.no_show_count. */
  noShowCount?: number;
  /** Дата первого визита (самый ранний canonical start_at < now). */
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
  /** Клиенты с действующим абонементом (`be_patient_packages.status = 'active'`). */
  membershipsCount: number;
  /** Клиенты с истёкшим абонементом (`be_patient_packages.status = 'expired'`). */
  expiredMembershipsCount: number;
  /** «Подписчики»: role=client, нет ни одной неотменённой записи. */
  subscriberCount: number;
  /** «Новые»: есть будущая запись, но ещё не было прошедшего посещения. */
  newCount: number;
  /** «Бывшие»: было прошедшее посещение, но нет будущей активной записи. */
  formerCount: number;
  /** Клиенты с хотя бы одной отменой за всё время. */
  cancellationsCount: number;
  /** Клиенты с хотя бы одним переносом за всё время. */
  reschedulesCount: number;
};

/** Строка в списке записей пациента (Записи таб). */
export type PatientAppointmentItem = {
  id: string;
  /**
   * Internal canonical appointment id used to link a clinical visit to this booking.
   * The field name is kept for compatibility with existing UI code.
   */
  internalId?: string | null;
  /** ISO timestamp момента записи. */
  dateTime: string;
  /**
   * Статус: состоялась / перенос / отмена / предстоит.
   * Маппинг: canonical cancelled statuses → 'canceled'; canonical rescheduled → 'rescheduled';
   * other non-cancelled past/future slots → 'completed' / 'upcoming'.
   */
  status: 'completed' | 'rescheduled' | 'canceled' | 'upcoming';
  /** Тип/услуга из canonical service title. */
  serviceName: string | null;
  /** Локация/филиал из canonical branch title. */
  location: string | null;
  /** Продолжительность (мин) из canonical appointment duration. */
  durationMin: number | null;
  /**
   * Запись списана с абонемента: be_appointments.package_usage_ref IS NOT NULL.
   * `patientPackageId` is resolved through canonical package usage when available.
   */
  isPackage?: boolean | null;
  patientPackageId?: string | null;
  packageTitle?: string | null;
  packageDisplayNumber?: number | null;
};

export type DoctorClientsPort = {
  listClients(
    filters: DoctorClientsFilters,
    audience?: { excludedUserIds?: string[] },
  ): Promise<ClientListItem[]>;
  /** История записей пациента по userId (прошедшие + предстоящие), новые сверху. */
  listPatientAppointments(
    userId: string,
    organizationId?: string,
  ): Promise<PatientAppointmentItem[]>;
  /**
   * Агрегат шапки карточки пациента (для нового раздела «Пациенты»).
   * Возвращает null, если пользователь не найден или не является клиентом.
   */
  getPatientCardHeader(userId: string): Promise<PatientCardHeader | null>;
  /** Сегменты контактов для аналитики `/app/doctor/analytics/clients`. */
  getClientContactBreakdown(audience?: {
    excludedUserIds?: string[];
    organizationId?: string;
    visibilityActor?: PatientVisibilityActor;
  }): Promise<ClientContactBreakdown>;
  /** Lightweight role lookup for routes that must distinguish missing users from non-clients. */
  getPlatformUserRole(userId: string): Promise<string | null>;
  getClientIdentity(userId: string): Promise<ClientIdentity | null>;
  /** Patient identity visible inside a concrete organization workspace. */
  getClientIdentityForOrganization(
    userId: string,
    organizationId: string,
    actor: PatientVisibilityActor,
  ): Promise<ClientIdentity | null>;
  /** Patient-scoped doctor APIs — `role = 'client'` only; otherwise `null`. */
  getPatientClientIdentity(userId: string): Promise<ClientIdentity | null>;
  getDashboardPatientMetrics(audience?: {
    excludedUserIds?: string[];
    organizationId?: string;
    visibilityActor?: PatientVisibilityActor;
  }): Promise<DoctorDashboardPatientMetrics>;
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
  setPatientGender(userId: string, gender: 'male' | 'female' | null): Promise<void>;
  /**
   * Обновляет structured FIO клиента. Compatibility display_name derives from the resulting fields.
   * Обновляются только переданные поля; structured parts допускают null (сброс).
   * Работает только для клиентов (role='client').
   */
  setPatientNames(
    userId: string,
    names: { firstName?: string | null; lastName?: string | null; patronymic?: string | null },
  ): Promise<void>;
  /**
   * Возвращает физические параметры пациента (рост/вес).
   * Null если не заданы. Возвращает null целиком если пользователь не найден или не клиент.
   */
  getPatientPhysical(
    userId: string,
  ): Promise<{ heightCm: number | null; weightKg: number | null } | null>;
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

export type { ClientSupportProfile, PatientProgramInteractionPolicy } from './supportPolicy';

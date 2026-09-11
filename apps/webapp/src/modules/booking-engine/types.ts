import type { AppointmentReminderPresetId } from '@/modules/booking-notifications/appointmentReminderPresets';
import type { PrepaymentMode } from '@/modules/payments/types';

export const APPOINTMENT_STATUSES = [
  'created',
  'awaiting_payment',
  'paid',
  'confirmed',
  'rescheduled',
  'cancelled_by_patient',
  'cancelled_by_specialist',
  'late_cancellation',
  'no_show',
  'completed',
  'visit_confirmed',
  'charged_to_package',
  'manual_review_required',
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_DELIVERY_FORMATS = ['in_person', 'online'] as const;
export type AppointmentDeliveryFormat = (typeof APPOINTMENT_DELIVERY_FORMATS)[number];

export type BeOrganization = {
  id: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
};

export type BeBranch = {
  id: string;
  organizationId: string;
  title: string;
  /** Short display name (e.g. «СПб», «Мск»). Nullable; UI falls back to title. Migration 0117. */
  shortTitle: string | null;
  /** Hex color for calendar/work schedule surfaces. */
  color: string | null;
  cityCode: string;
  address: string | null;
  timezone: string;
  isActive: boolean;
  sortOrder: number;
};

export type BeRoom = {
  id: string;
  organizationId: string;
  branchId: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
};

export type BeSpecialist = {
  id: string;
  organizationId: string;
  fullName: string;
  /** Короткое описание обычным текстом: превью на визитке и строка в мастере записи. */
  description: string | null;
  /** Аватар специалиста (#926 §17.H, владелец 11.09: «аватар-специалист обязательно нужно»). */
  avatarMediaId: string | null;
  /** Полное описание материалом: GFM-markdown, рисует его только публичная страница. */
  fullDescriptionMarkdown: string | null;
  /** Клиника решает, показывать ли человека снаружи. Выключено — снаружи его нет вовсе. */
  cardIsPublished: boolean;
  appointmentReminderAllowedPresetIds: AppointmentReminderPresetId[];
  appointmentReminderDefaultPresetId: AppointmentReminderPresetId | null;
  isActive: boolean;
  sortOrder: number;
};

export type BeClinicService = {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
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
};

export type BeSpecialistServiceAvailability = {
  id: string;
  organizationId: string;
  specialistId: string;
  serviceId: string;
  branchId: string | null;
  roomId: string | null;
  cityCode: string | null;
  priceMinorOverride: number | null;
  isActive: boolean;
  sortOrder: number;
};

export type BeServiceLocationAvailability = {
  id: string;
  organizationId: string;
  serviceId: string;
  branchId: string;
  isActive: boolean;
};

export type BeAppointment = {
  id: string;
  organizationId: string;
  branchId: string | null;
  roomId: string | null;
  specialistId: string | null;
  serviceId: string | null;
  platformUserId: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  chainId?: string | null;
  chainPosition?: number | null;
  source: 'native' | 'imported' | 'admin_manual' | 'public_widget';
  status: AppointmentStatus;
  deliveryFormat: AppointmentDeliveryFormat;
  originalStartAt: string | null;
  rescheduleCount: number;
  paymentRef: string | null;
  /**
   * PAY-APPT-01/18: финансовый снимок принадлежит самой записи. `priceMinor === null` —
   * запись создана до появления снимка; читатели в этом случае продолжают показывать значение
   * исторической проекции `patient_bookings`, а не выдумывают ноль.
   */
  priceMinor: number | null;
  priceCurrency: string;
  prepaymentMode: PrepaymentMode;
  prepaymentPercentBps: number | null;
  prepaymentAmountMinor: number | null;
  prepaymentRequiredMinor: number;
  /** Факт зачисленных денег. Пишет ТОЛЬКО платёжный корень, не кабинет и не пациент. */
  prepaymentPaidMinor: number;
  paymentDeadlineAt: string | null;
  packageUsageRef: string | null;
  phoneNormalized: string | null;
  attributionJson: Record<string, unknown>;
  appointmentReminderAllowedPresetIds: AppointmentReminderPresetId[];
  appointmentReminderPresetId: AppointmentReminderPresetId | null;
  appointmentReminderSelectionSource: 'specialist_default' | 'patient';
};

/**
 * Канонический контракт записи финансового снимка. ОДИН на пациентский и врачебный путь: и
 * `canonicalCreate`, и ручное создание/правка врачом кладут ровно эти поля, посчитанные
 * `resolveAppointmentFinancialSnapshot`.
 */
export type AppointmentFinancialFields = {
  priceMinor?: number | null;
  priceCurrency?: string;
  prepaymentMode?: PrepaymentMode;
  prepaymentPercentBps?: number | null;
  prepaymentAmountMinor?: number | null;
  prepaymentRequiredMinor?: number;
  paymentDeadlineAt?: string | null;
};

export type CreateAppointmentInput = {
  id?: string;
  organizationId: string;
  branchId?: string | null;
  roomId?: string | null;
  specialistId?: string | null;
  serviceId?: string | null;
  platformUserId?: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  /** Shared only by the rows of one consecutive patient-booking chain. */
  chainId?: string | null;
  /** Zero-based row position inside `chainId`. */
  chainPosition?: number | null;
  source: BeAppointment['source'];
  status?: AppointmentStatus;
  /** Explicit staff override or server-derived default for the appointment delivery. */
  deliveryFormat?: AppointmentDeliveryFormat;
  phoneNormalized?: string | null;
  actorId?: string | null;
  attributionJson?: Record<string, unknown>;
  appointmentReminderAllowedPresetIds?: AppointmentReminderPresetId[];
  appointmentReminderPresetId?: AppointmentReminderPresetId | null;
  appointmentReminderSelectionSource?: 'specialist_default' | 'patient';
  /**
   * ENCOUNTER-APPOINTMENT-05: слот, наложение на который специалист подтвердил ЯВНО. Пара
   * совпадает с `startAt`/`endAt` этой же записи и только в этом случае выводит строку из-под
   * `be_appointments_specialist_no_overlap`; любой последующий перенос перевзводит защиту сам.
   * Ставит её ровно один вызывающий — авторизованная ручная дверь врача после подтверждения.
   */
  overlapConfirmedStartAt?: string | null;
  overlapConfirmedEndAt?: string | null;
} & AppointmentFinancialFields;

type CreateManualPatientIdentityInput = {
  organizationId: string;
  commandId: string;
  /** APPT-FORM-05: обязательно только имя пациента. */
  lastName: string | null;
  firstName: string;
  patronymic: string | null;
  phoneNormalized: string | null;
  emailRaw: string | null;
  emailNormalized: string | null;
};

export type CreateManualPatientVisitInput = CreateManualPatientIdentityInput &
  (
    | {
        kind: 'scheduled';
        appointment: Omit<
          CreateAppointmentInput,
          'organizationId' | 'platformUserId' | 'phoneNormalized'
        >;
      }
    | {
        kind: 'walk_in';
        walkIn: {
          specialistId: string;
          visitedAt: string;
          actorId: string;
        };
      }
  );

type CreateManualPatientResult = {
  replayed: boolean;
  /** Manual staff creation never proves patient control of a portal identity. */
  portalStatus: 'not_activated' | 'linked';
  patient: {
    userId: string;
    displayName: string;
    lastName: string | null;
    firstName: string | null;
    patronymic: string | null;
    phoneNormalized: string | null;
    created: boolean;
  };
};

export type CreateManualPatientVisitResult = CreateManualPatientResult &
  (
    | {
        kind: 'scheduled';
        appointment: BeAppointment;
        clinicalVisitId: null;
      }
    | {
        kind: 'walk_in';
        appointment: null;
        clinicalVisitId: string;
      }
  );

export type TransitionAppointmentStatusInput = {
  appointmentId: string;
  toStatus: AppointmentStatus;
  actorId?: string | null;
  payload?: Record<string, unknown>;
};

/**
 * PAY-APPT-12: переписывание финансового снимка уже существующей записи. Значения приходят
 * ПОСЧИТАННЫМИ (`resolveAppointmentFinancialSnapshot`) — здесь только запись и замок на деньги.
 */
/** Плоское представление снимка одной записи для батчевых читателей карточки/календаря. */
export type AppointmentFinancialSnapshotRecord = {
  appointmentId: string;
  priceMinor: number | null;
  priceCurrency: string;
  prepaymentMode: PrepaymentMode;
  prepaymentPercentBps: number | null;
  prepaymentAmountMinor?: number | null;
  prepaymentRequiredMinor: number;
  prepaymentPaidMinor: number;
  paymentDeadlineAt: string | null;
};

export type UpdateAppointmentFinancialSnapshotInput = {
  appointmentId: string;
  organizationId: string;
  actorId?: string | null;
  snapshot: Required<Omit<AppointmentFinancialFields, 'priceCurrency'>> & { priceCurrency: string };
};

import type { AppointmentReminderPresetId } from '@/modules/booking-notifications/appointmentReminderPresets';

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
  description: string | null;
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
  originalStartAt: string | null;
  rescheduleCount: number;
  paymentRef: string | null;
  packageUsageRef: string | null;
  phoneNormalized: string | null;
  attributionJson: Record<string, unknown>;
  appointmentReminderAllowedPresetIds: AppointmentReminderPresetId[];
  appointmentReminderPresetId: AppointmentReminderPresetId | null;
  appointmentReminderSelectionSource: 'specialist_default' | 'patient';
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
  phoneNormalized?: string | null;
  actorId?: string | null;
  attributionJson?: Record<string, unknown>;
  appointmentReminderAllowedPresetIds?: AppointmentReminderPresetId[];
  appointmentReminderPresetId?: AppointmentReminderPresetId | null;
  appointmentReminderSelectionSource?: 'specialist_default' | 'patient';
};

type CreateManualPatientIdentityInput = {
  organizationId: string;
  commandId: string;
  lastName: string;
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

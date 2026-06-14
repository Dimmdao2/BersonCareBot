import type { BeAppointment } from "@/modules/booking-engine/types";
import type {
  AppointmentActorType,
  CancellationDecisionType,
  CancellationPolicy,
  ReschedulePolicy,
} from "@/modules/booking-policies/types";

export type AppointmentNoShowRecord = {
  id: string;
  organizationId: string;
  appointmentId: string;
  actorType: Extract<AppointmentActorType, "specialist" | "admin" | "system">;
  actorId: string | null;
  reason: string | null;
  staffComment: string | null;
  notificationsSent: Record<string, unknown>;
  manualOverride: boolean;
  createdAt: string;
};

export type MarkNoShowInput = {
  appointmentId: string;
  organizationId: string;
  actorType: Extract<AppointmentActorType, "specialist" | "admin" | "system">;
  actorId: string | null;
  reason?: string;
  staffComment?: string;
  manualOverride?: boolean;
  notificationsSent?: Record<string, unknown>;
};

export type AppointmentRescheduleRecord = {
  id: string;
  organizationId: string;
  appointmentId: string;
  fromStartAt: string;
  fromEndAt: string;
  toStartAt: string;
  toEndAt: string;
  actorType: AppointmentActorType;
  actorId: string | null;
  wasInFreeRescheduleWindow: boolean;
  freeCancellationAvailableAtReschedule: boolean;
  freeCancellationAvailableAfter: boolean;
  appliedPolicyId: string | null;
  appliedPolicySnapshot: Record<string, unknown>;
  reason: string | null;
  staffComment: string | null;
  notificationsSent: Record<string, unknown>;
  manualOverride: boolean;
  createdAt: string;
};

export type AppointmentCancellationRecord = {
  id: string;
  organizationId: string;
  appointmentId: string;
  actorType: AppointmentActorType;
  actorId: string | null;
  cancellationType: CancellationDecisionType;
  reason: string | null;
  wasFree: boolean;
  wasPenalized: boolean;
  packageSessionCharged: boolean;
  prepaymentRetained: boolean;
  prepaymentRefunded: boolean;
  staffComment: string | null;
  notificationsSent: Record<string, unknown>;
  manualOverride: boolean;
  appliedPolicyId: string | null;
  appliedPolicySnapshot: Record<string, unknown>;
  createdAt: string;
};

export type RescheduleAppointmentInput = {
  appointmentId: string;
  organizationId: string;
  newStartAt: string;
  newEndAt: string;
  durationMinutes: number;
  actorType: AppointmentActorType;
  actorId: string | null;
  reason?: string;
  staffComment?: string;
  manualOverride?: boolean;
  branchId?: string | null;
  roomId?: string | null;
  specialistId?: string | null;
  serviceId?: string | null;
  cityCode?: string | null;
};

export type CancelAppointmentInput = {
  appointmentId: string;
  organizationId: string;
  actorType: AppointmentActorType;
  actorId: string | null;
  reason?: string;
  staffComment?: string;
  manualOverride?: boolean;
  decisionType?: CancellationDecisionType;
};

export type AppointmentLifecyclePort = {
  getAppointment(appointmentId: string, organizationId: string): Promise<BeAppointment | null>;
  listReschedules(appointmentId: string, organizationId: string): Promise<AppointmentRescheduleRecord[]>;
  listCancellations(appointmentId: string, organizationId: string): Promise<AppointmentCancellationRecord[]>;
  applyReschedule(
    input: RescheduleAppointmentInput & {
      policy: ReschedulePolicy;
      cancellationPolicy: CancellationPolicy;
      wasInFreeRescheduleWindow: boolean;
      freeCancellationAvailableAtReschedule: boolean;
      freeCancellationAvailableAfter: boolean;
      notificationsSent?: Record<string, unknown>;
    },
  ): Promise<BeAppointment>;
  applyCancellation(
    input: CancelAppointmentInput & {
      policy: CancellationPolicy;
      wasFree: boolean;
      wasPenalized: boolean;
      decisionType: CancellationDecisionType;
      targetStatus: BeAppointment["status"];
      packageSessionCharged: boolean;
      prepaymentRetained: boolean;
      prepaymentRefunded: boolean;
      notificationsSent?: Record<string, unknown>;
    },
  ): Promise<BeAppointment>;
  patchLatestRescheduleNotifications(
    appointmentId: string,
    organizationId: string,
    notificationsSent: Record<string, unknown>,
  ): Promise<void>;
  patchLatestCancellationNotifications(
    appointmentId: string,
    organizationId: string,
    notificationsSent: Record<string, unknown>,
  ): Promise<void>;
  /** Mark appointment as no-show: transition status, write history record, increment per-patient counter. */
  applyNoShow(input: MarkNoShowInput): Promise<BeAppointment>;
  listNoShows(appointmentId: string, organizationId: string): Promise<AppointmentNoShowRecord[]>;
  patchLatestNoShowNotifications(
    appointmentId: string,
    organizationId: string,
    notificationsSent: Record<string, unknown>,
  ): Promise<void>;
};

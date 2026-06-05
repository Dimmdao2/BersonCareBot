import type { AppointmentStatus } from "@/modules/booking-engine/types";

export type SyncOrigin = "rubitime" | "canonical";

export type AppointmentMirrorSnapshot = {
  organizationId: string;
  appointmentId?: string;
  externalRubitimeId: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  branchId: string | null;
  specialistId: string | null;
  serviceId: string | null;
  status: AppointmentStatus;
  phoneNormalized: string | null;
  platformUserId: string | null;
};

export type RubitimeInboundEventInput = {
  organizationId: string;
  externalId: string;
  platformUserId: string | null;
  phoneNormalized: string | null;
  recordAt: string | null;
  legacyStatus: string;
  lastEvent: string;
  payloadJson: unknown;
  /** Top-level fan-out fields from integrator (merged into payload). */
  fanout?: {
    dateTimeEnd?: string | null;
    serviceId?: string | null;
    rubitimeCooperatorId?: string | null;
    integratorBranchId?: string | null;
  };
};

export type RubitimeOutboundPatch = {
  record?: string;
  datetime_end?: string;
  branch_id?: number;
  service_id?: number;
  cooperator_id?: number;
  status?: number;
};

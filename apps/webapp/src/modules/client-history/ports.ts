import type {
  AppointmentStaffCommentRow,
  ClientPaymentHistoryRow,
  ClientTimelineItem,
  ClientVisitHistoryRow,
  CreateAppointmentStaffCommentInput,
  PatientBookingProfile,
  UpsertPatientBookingProfileInput,
} from "./types";

export type ClientHistoryPort = {
  listTimeline(
    organizationId: string,
    platformUserId: string,
    limit?: number,
  ): Promise<ClientTimelineItem[]>;
  listPaymentHistory(
    organizationId: string,
    platformUserId: string,
    limit?: number,
  ): Promise<ClientPaymentHistoryRow[]>;
  listVisitHistory(
    organizationId: string,
    platformUserId: string,
    limit?: number,
  ): Promise<ClientVisitHistoryRow[]>;
  getBookingProfile(
    organizationId: string,
    platformUserId: string,
  ): Promise<PatientBookingProfile | null>;
  upsertBookingProfile(input: UpsertPatientBookingProfileInput): Promise<PatientBookingProfile>;
  isBookingBlocked(organizationId: string, platformUserId: string): Promise<boolean>;
  listAppointmentComments(
    organizationId: string,
    appointmentId: string,
  ): Promise<AppointmentStaffCommentRow[]>;
  createAppointmentComment(input: CreateAppointmentStaffCommentInput): Promise<AppointmentStaffCommentRow>;
};

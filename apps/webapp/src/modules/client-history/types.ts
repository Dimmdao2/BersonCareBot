export type ClientTimelineCategory =
  | "appointment"
  | "payment"
  | "package"
  | "product"
  | "comment"
  | "reschedule"
  | "cancellation";

export type ClientTimelineItem = {
  id: string;
  category: ClientTimelineCategory;
  eventType: string;
  title: string;
  summary: string | null;
  occurredAt: string;
  linkedObjectType: string;
  linkedObjectId: string;
  appointmentId: string | null;
  payload: Record<string, unknown>;
};

export type ClientPaymentHistoryRow = {
  id: string;
  occurredAt: string;
  eventType: string;
  amountMinor: number | null;
  currency: string | null;
  providerId: string | null;
  paymentMethodLabel: string | null;
  status: string | null;
  purpose: string | null;
  appointmentId: string | null;
  paymentId: string | null;
  refundId: string | null;
  comment: string | null;
  serviceTitle: string | null;
  packageTitle: string | null;
  productTitle: string | null;
};

export type ClientVisitHistoryRow = {
  appointmentId: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: string;
  specialistName: string | null;
  branchTitle: string | null;
  roomTitle: string | null;
  serviceTitle: string | null;
  wasViaPackage: boolean;
  packageUsageSummary: string | null;
  prepaymentAmountMinor: number | null;
  prepaymentCurrency: string | null;
  finalPaymentAmountMinor: number | null;
  finalPaymentCurrency: string | null;
  staffComment: string | null;
};

export type PatientBookingProfile = {
  platformUserId: string;
  organizationId: string;
  isProblematic: boolean;
  bookingBlocked: boolean;
  problematicNote: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type AppointmentStaffCommentRow = {
  id: string;
  appointmentId: string;
  platformUserId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type UpsertPatientBookingProfileInput = {
  organizationId: string;
  platformUserId: string;
  isProblematic?: boolean;
  bookingBlocked?: boolean;
  problematicNote?: string | null;
  updatedBy: string;
};

export type CreateAppointmentStaffCommentInput = {
  organizationId: string;
  appointmentId: string;
  platformUserId: string;
  authorId: string;
  body: string;
};

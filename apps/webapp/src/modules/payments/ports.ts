import type {
  AppointmentPaymentSummary,
  BookingPaymentSettings,
  PaymentHistoryEventRecord,
  PaymentIntentRecord,
  PaymentRecord,
  PrepaymentPolicyRecord,
  PrepaymentQuote,
} from "./types";

export type UpsertPrepaymentPolicyInput = {
  organizationId: string;
  serviceId?: string | null;
  onlineCategory?: string | null;
  mode: PrepaymentPolicyRecord["mode"];
  amountMinor?: number | null;
  percentBps?: number | null;
  currency?: string;
  isActive?: boolean;
};

export type CreatePaymentIntentInput = {
  organizationId: string;
  idempotencyKey: string;
  providerId: string;
  appointmentId?: string | null;
  platformUserId: string;
  productRef?: string | null;
  amountMinor: number;
  currency: string;
  purpose?: string;
  providerIntentRef: string;
  metadataJson?: Record<string, unknown>;
};

export type PaymentsPort = {
  getPrepaymentPolicyForService(organizationId: string, serviceId: string): Promise<PrepaymentPolicyRecord | null>;
  getPrepaymentPolicyForOnlineCategory(
    organizationId: string,
    onlineCategory: string,
  ): Promise<PrepaymentPolicyRecord | null>;
  listPrepaymentPolicies(organizationId: string): Promise<PrepaymentPolicyRecord[]>;
  upsertPrepaymentPolicy(input: UpsertPrepaymentPolicyInput): Promise<PrepaymentPolicyRecord>;

  findIntentByIdempotency(organizationId: string, idempotencyKey: string): Promise<PaymentIntentRecord | null>;
  findLatestIntentByAppointment(appointmentId: string): Promise<PaymentIntentRecord | null>;
  findIntentById(id: string): Promise<PaymentIntentRecord | null>;
  findIntentByProviderRef(organizationId: string, providerIntentRef: string): Promise<PaymentIntentRecord | null>;
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentRecord>;
  updateIntentStatus(intentId: string, status: string): Promise<PaymentIntentRecord | null>;

  findPaymentByIntent(intentId: string): Promise<PaymentRecord | null>;
  findPaymentByAppointment(appointmentId: string): Promise<PaymentRecord | null>;
  createPaymentFromIntent(intent: PaymentIntentRecord): Promise<PaymentRecord>;
  updatePaymentStatus(paymentId: string, status: string): Promise<void>;

  createRefund(input: {
    organizationId: string;
    paymentId: string;
    appointmentId: string | null;
    amountMinor: number;
    currency: string;
    status: string;
    reason?: string;
    providerRefundRef?: string;
  }): Promise<{ id: string }>;

  recordProviderEvent(input: {
    organizationId: string;
    providerId: string;
    idempotencyKey: string;
    eventType: string;
    payloadJson: Record<string, unknown>;
  }): Promise<{ inserted: boolean; id: string }>;
  markProviderEventProcessed(id: string): Promise<void>;

  appendHistoryEvent(input: {
    organizationId: string;
    appointmentId?: string | null;
    platformUserId?: string | null;
    paymentId?: string | null;
    refundId?: string | null;
    eventType: string;
    amountMinor?: number | null;
    currency?: string | null;
    providerId?: string | null;
    status?: string | null;
    purpose?: string | null;
    comment?: string | null;
    payloadJson?: Record<string, unknown>;
  }): Promise<void>;

  listHistoryForAppointment(appointmentId: string, organizationId: string): Promise<PaymentHistoryEventRecord[]>;
  listHistoryForUser(platformUserId: string, organizationId: string, limit?: number): Promise<PaymentHistoryEventRecord[]>;
  setAppointmentPaymentRef(appointmentId: string, paymentId: string): Promise<void>;
};

export type PaymentsConfigReader = {
  getBookingPaymentSettings(): Promise<BookingPaymentSettings>;
};

export type ResolvePrepaymentParams = {
  organizationId: string;
  serviceId: string | null;
  onlineCategory?: string | null;
  servicePriceMinor: number | null;
  currency?: string;
};

export type { PrepaymentQuote, AppointmentPaymentSummary, BookingPaymentSettings };

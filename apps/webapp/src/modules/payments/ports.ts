import type {
  AppointmentPaymentSummary,
  BookingPaymentSettings,
  PaymentHistoryEventRecord,
  PaymentIntentRecord,
  PaymentRecord,
  PrepaymentPolicyRecord,
  PrepaymentQuote,
} from './types';

export type UpsertPrepaymentPolicyInput = {
  organizationId: string;
  serviceId?: string | null;
  onlineCategory?: string | null;
  mode: PrepaymentPolicyRecord['mode'];
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
  getPrepaymentPolicyForService(
    organizationId: string,
    serviceId: string,
  ): Promise<PrepaymentPolicyRecord | null>;
  getPrepaymentPolicyForOnlineCategory(
    organizationId: string,
    onlineCategory: string,
  ): Promise<PrepaymentPolicyRecord | null>;
  listPrepaymentPolicies(organizationId: string): Promise<PrepaymentPolicyRecord[]>;
  upsertPrepaymentPolicy(input: UpsertPrepaymentPolicyInput): Promise<PrepaymentPolicyRecord>;

  findIntentByIdempotency(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<PaymentIntentRecord | null>;
  findLatestIntentByAppointment(appointmentId: string): Promise<PaymentIntentRecord | null>;
  findIntentById(id: string): Promise<PaymentIntentRecord | null>;
  /** Locks the intent row inside the active capture UoW and returns current committed state. */
  lockIntentForCapture(
    intentId: string,
    organizationId: string,
  ): Promise<PaymentIntentRecord | null>;
  findIntentByProviderRef(
    organizationId: string,
    providerIntentRef: string,
  ): Promise<PaymentIntentRecord | null>;
  resolveProviderWebhookOrganization(
    providerId: string,
    idempotencyKey: string,
    eventType: string,
  ): Promise<string | null>;
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentRecord>;
  updateIntentStatus(
    intentId: string,
    status: string,
    organizationId: string,
  ): Promise<PaymentIntentRecord | null>;

  findPaymentByIntent(intentId: string): Promise<PaymentRecord | null>;
  findPaymentById(paymentId: string, organizationId: string): Promise<PaymentRecord | null>;
  countAppointmentsByPaymentRef(paymentId: string, organizationId: string): Promise<number>;
  createPaymentFromIntent(intent: PaymentIntentRecord): Promise<PaymentRecord>;
  updatePaymentStatus(paymentId: string, status: string, organizationId: string): Promise<void>;
  getSucceededRefundedAmount(paymentId: string, organizationId: string): Promise<number>;

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
    intentRef: string | null;
    payloadJson: Record<string, unknown>;
  }): Promise<StoredPaymentProviderEvent>;
  getProviderEventById(
    id: string,
    organizationId: string,
  ): Promise<StoredPaymentProviderEvent | null>;
  markProviderEventProcessed(id: string, organizationId: string): Promise<void>;

  hasCapturedHistoryEvent(paymentId: string, organizationId: string): Promise<boolean>;

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

  listHistoryForAppointment(
    appointmentId: string,
    organizationId: string,
  ): Promise<PaymentHistoryEventRecord[]>;
  listHistoryForUser(
    platformUserId: string,
    organizationId: string,
    limit?: number,
  ): Promise<PaymentHistoryEventRecord[]>;
  setAppointmentPaymentRef(
    appointmentId: string,
    paymentId: string,
    organizationId: string,
  ): Promise<void>;
};

export type StoredPaymentProviderEvent = {
  inserted: boolean;
  id: string;
  organizationId: string;
  providerId: string;
  idempotencyKey: string;
  eventType: string;
  intentRef: string | null;
  payloadJson: Record<string, unknown>;
  processedAt: string | null;
};

export type PaymentCaptureUnitOfWork = {
  run<T>(organizationId: string, fn: () => Promise<T>): Promise<T>;
  runSerializedPostCommit<T>(
    organizationId: string,
    captureKey: string,
    fn: () => Promise<T>,
  ): Promise<T>;
};

export type PaymentsConfigReader = {
  getBookingPaymentSettings(organizationId?: string): Promise<BookingPaymentSettings>;
};

export type ResolvePrepaymentParams = {
  organizationId: string;
  serviceId: string | null;
  onlineCategory?: string | null;
  servicePriceMinor: number | null;
  currency?: string;
};

export type { PrepaymentQuote, AppointmentPaymentSummary, BookingPaymentSettings };

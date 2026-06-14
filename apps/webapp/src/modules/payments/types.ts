import type { PrepaymentMode } from "../../../db/schema/bookingPayments";

export type { PrepaymentMode };

export type PrepaymentPolicyRecord = {
  id: string;
  organizationId: string;
  serviceId: string | null;
  onlineCategory: string | null;
  mode: PrepaymentMode;
  amountMinor: number | null;
  percentBps: number | null;
  currency: string;
  isActive: boolean;
};

export type PrepaymentQuote = {
  required: boolean;
  amountMinor: number;
  currency: string;
  mode: PrepaymentMode;
};

export type PaymentProviderConfig = {
  id: string;
  label: string;
  enabled: boolean;
  webhookSecret?: string;
  /** YooKassa: Secret Key; CloudPayments: API Secret; Alfa-Bank: password; Tinkoff: terminal password */
  apiKey?: string;
  /** YooKassa: Shop ID; Tinkoff: TerminalKey; Alfa-Bank: login (merchant username) */
  shopId?: string;
  /** Tinkoff: TerminalKey (alias for shopId when shopId is ambiguous) */
  terminalKey?: string;
  /** CloudPayments: Public ID */
  publicId?: string;
  /** Alfa-Bank: merchant login */
  merchantLogin?: string;
  /** Acquiring gateway base URL override (Alfa-Bank test vs prod). */
  gatewayUrl?: string;
};

export type BookingPaymentSettings = {
  enabled: boolean;
  defaultProviderId: string;
  providers: PaymentProviderConfig[];
};

export type PaymentIntentRecord = {
  id: string;
  organizationId: string;
  idempotencyKey: string;
  providerId: string;
  appointmentId: string | null;
  platformUserId: string | null;
  productRef: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  purpose: string;
  providerIntentRef: string | null;
};

export type PaymentRecord = {
  id: string;
  organizationId: string;
  paymentIntentId: string;
  appointmentId: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  providerId: string;
  purpose: string;
};

export type PaymentHistoryEventRecord = {
  id: string;
  organizationId: string;
  appointmentId: string | null;
  platformUserId: string | null;
  paymentId: string | null;
  refundId: string | null;
  eventType: string;
  amountMinor: number | null;
  currency: string | null;
  providerId: string | null;
  status: string | null;
  purpose: string | null;
  comment: string | null;
  occurredAt: string;
};

export type AppointmentPaymentSummary = {
  appointmentId: string;
  appointmentStatus: string;
  prepaymentQuote: PrepaymentQuote | null;
  intent: PaymentIntentRecord | null;
  payment: PaymentRecord | null;
  history: PaymentHistoryEventRecord[];
};

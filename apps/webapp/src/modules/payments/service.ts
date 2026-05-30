import type { BeAppointment } from "@/modules/booking-engine/types";
import type { BookingEnginePort } from "@/modules/booking-engine/ports";
import { getPaymentProviderAdapter } from "@/infra/payments/paymentProviderRegistry";
import { parseBookingPaymentSettingsValue } from "./bookingPaymentSettings";
import { quotePrepayment } from "./prepaymentCalculator";
import type { PaymentsConfigReader, PaymentsPort } from "./ports";
import type { AppointmentPaymentSummary, BookingPaymentSettings, PrepaymentQuote } from "./types";
import type { ResolvePrepaymentParams } from "./ports";
import type { PrepaymentResolveContext } from "./prepaymentContextFromBooking";
import { parsePatientPackageProductRef } from "@/modules/memberships/patientPackageProductRef";
import { parseProductPurchaseProductRef } from "@/modules/products/productPurchaseProductRef";

export function createPaymentsService(deps: {
  port: PaymentsPort;
  config: PaymentsConfigReader;
  bookingEngine: Pick<BookingEnginePort, "getAppointment" | "transitionAppointmentStatus"> | null;
  onAppointmentPaymentConfirmed?: (input: {
    appointmentId: string;
    paymentId: string;
    platformUserId: string | null;
  }) => Promise<void>;
  onPackagePaymentCaptured?: (input: {
    patientPackageId: string;
    paymentId: string;
    platformUserId: string | null;
    organizationId: string;
  }) => Promise<void>;
  onProductPaymentCaptured?: (input: {
    productPurchaseId: string;
    paymentId: string;
    platformUserId: string | null;
    organizationId: string;
  }) => Promise<void>;
  syncServicePrepaymentApplicable?: (serviceId: string, applicable: boolean) => Promise<void>;
}) {
  async function loadSettings(): Promise<BookingPaymentSettings> {
    return deps.config.getBookingPaymentSettings();
  }

  function resolveActiveProvider(settings: BookingPaymentSettings, providerId?: string) {
    const id = providerId?.trim() || settings.defaultProviderId;
    const provider = settings.providers.find((p) => p.id === id && p.enabled);
    if (!provider) throw new Error("payment_provider_unavailable");
    return provider;
  }

  return {
    async getSettings(): Promise<BookingPaymentSettings> {
      return loadSettings();
    },

    async resolvePrepayment(params: ResolvePrepaymentParams): Promise<PrepaymentQuote> {
      const settings = await loadSettings();
      const policy = params.serviceId
        ? await deps.port.getPrepaymentPolicyForService(params.organizationId, params.serviceId)
        : params.onlineCategory
          ? await deps.port.getPrepaymentPolicyForOnlineCategory(
              params.organizationId,
              params.onlineCategory,
            )
          : null;
      return quotePrepayment({
        policy,
        servicePriceMinor: params.servicePriceMinor,
        currency: params.currency ?? policy?.currency ?? "RUB",
        paymentsGloballyEnabled: settings.enabled,
      });
    },

    async listPrepaymentPolicies(organizationId: string) {
      return deps.port.listPrepaymentPolicies(organizationId);
    },

    async upsertPrepaymentPolicy(
      input: Parameters<PaymentsPort["upsertPrepaymentPolicy"]>[0],
    ) {
      const row = await deps.port.upsertPrepaymentPolicy(input);
      if (input.serviceId && deps.syncServicePrepaymentApplicable) {
        await deps.syncServicePrepaymentApplicable(
          input.serviceId,
          input.mode !== "disabled" && (input.isActive ?? true),
        );
      }
      return row;
    },

    async recordReschedulePaymentCarryOver(input: {
      appointmentId: string;
      organizationId: string;
      platformUserId?: string | null;
      newStartAt: string;
    }) {
      const payment = await deps.port.findPaymentByAppointment(input.appointmentId);
      if (!payment) return { ok: true as const, skipped: true as const };
      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        appointmentId: input.appointmentId,
        platformUserId: input.platformUserId ?? null,
        paymentId: payment.id,
        eventType: "prepayment_carried_on_reschedule",
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        providerId: payment.providerId,
        comment: input.newStartAt,
      });
      return { ok: true as const, skipped: false as const };
    },

    async listPaymentHistoryForUser(platformUserId: string, organizationId: string) {
      return deps.port.listHistoryForUser(platformUserId, organizationId);
    },

    async createAppointmentPaymentIntent(input: {
      organizationId: string;
      appointmentId: string;
      platformUserId: string;
      amountMinor: number;
      currency: string;
      idempotencyKey: string;
      providerId?: string;
    }) {
      const settings = await loadSettings();
      if (!settings.enabled) throw new Error("payments_disabled");
      const provider = resolveActiveProvider(settings, input.providerId);
      const adapter = getPaymentProviderAdapter(provider.id);
      const existing = await deps.port.findIntentByIdempotency(
        input.organizationId,
        input.idempotencyKey,
      );
      if (existing) return existing;

      const created = await adapter.createIntent({
        amountMinor: input.amountMinor,
        currency: input.currency,
        idempotencyKey: input.idempotencyKey,
        metadata: { appointmentId: input.appointmentId },
        providerConfig: provider,
      });

      const intent = await deps.port.createPaymentIntent({
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        providerId: provider.id,
        appointmentId: input.appointmentId,
        platformUserId: input.platformUserId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        providerIntentRef: created.providerIntentRef,
      });

      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        appointmentId: input.appointmentId,
        platformUserId: input.platformUserId,
        eventType: "intent_created",
        amountMinor: input.amountMinor,
        currency: input.currency,
        providerId: provider.id,
        status: intent.status,
        purpose: intent.purpose,
      });

      return intent;
    },

    async createPackagePaymentIntent(input: {
      organizationId: string;
      platformUserId: string;
      patientPackageId: string;
      amountMinor: number;
      currency: string;
      idempotencyKey: string;
      providerId?: string;
    }) {
      const settings = await loadSettings();
      if (!settings.enabled) throw new Error("payments_disabled");
      const provider = resolveActiveProvider(settings, input.providerId);
      const adapter = getPaymentProviderAdapter(provider.id);
      const existing = await deps.port.findIntentByIdempotency(
        input.organizationId,
        input.idempotencyKey,
      );
      if (existing) return existing;

      const productRef = `patient_package:${input.patientPackageId}`;
      const created = await adapter.createIntent({
        amountMinor: input.amountMinor,
        currency: input.currency,
        idempotencyKey: input.idempotencyKey,
        metadata: { patientPackageId: input.patientPackageId },
        providerConfig: provider,
      });

      const intent = await deps.port.createPaymentIntent({
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        providerId: provider.id,
        platformUserId: input.platformUserId,
        productRef,
        amountMinor: input.amountMinor,
        currency: input.currency,
        purpose: "package_purchase",
        providerIntentRef: created.providerIntentRef,
        metadataJson: { patientPackageId: input.patientPackageId },
      });

      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        platformUserId: input.platformUserId,
        eventType: "package_intent_created",
        amountMinor: input.amountMinor,
        currency: input.currency,
        providerId: provider.id,
        status: intent.status,
        purpose: intent.purpose,
        payloadJson: { patientPackageId: input.patientPackageId, productRef },
      });

      return intent;
    },

    async createProductPaymentIntent(input: {
      organizationId: string;
      platformUserId: string;
      productPurchaseId: string;
      amountMinor: number;
      currency: string;
      idempotencyKey: string;
      providerId?: string;
    }) {
      const settings = await loadSettings();
      if (!settings.enabled) throw new Error("payments_disabled");
      const provider = resolveActiveProvider(settings, input.providerId);
      const adapter = getPaymentProviderAdapter(provider.id);
      const existing = await deps.port.findIntentByIdempotency(
        input.organizationId,
        input.idempotencyKey,
      );
      if (existing) return existing;

      const productRef = `product_purchase:${input.productPurchaseId}`;
      const created = await adapter.createIntent({
        amountMinor: input.amountMinor,
        currency: input.currency,
        idempotencyKey: input.idempotencyKey,
        metadata: { productPurchaseId: input.productPurchaseId },
        providerConfig: provider,
      });

      const intent = await deps.port.createPaymentIntent({
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        providerId: provider.id,
        platformUserId: input.platformUserId,
        productRef,
        amountMinor: input.amountMinor,
        currency: input.currency,
        purpose: "product_purchase",
        providerIntentRef: created.providerIntentRef,
        metadataJson: { productPurchaseId: input.productPurchaseId },
      });

      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        platformUserId: input.platformUserId,
        eventType: "product_intent_created",
        amountMinor: input.amountMinor,
        currency: input.currency,
        providerId: provider.id,
        status: intent.status,
        purpose: intent.purpose,
        payloadJson: { productPurchaseId: input.productPurchaseId, productRef },
      });

      return intent;
    },

    async captureIntentForPatient(intentId: string, organizationId: string, platformUserId: string) {
      const intent = await deps.port.findIntentById(intentId);
      if (!intent || intent.organizationId !== organizationId) throw new Error("intent_not_found");
      if (intent.platformUserId !== platformUserId) throw new Error("forbidden");
      return this.captureIntentSuccess(intentId, organizationId);
    },

    async captureIntentForBooking(input: {
      intentId: string;
      organizationId: string;
      bookingId: string;
      verifyPhone: string;
      bookingUserId: string | null;
      bookingContactPhone: string;
    }) {
      const intent = await deps.port.findIntentById(input.intentId);
      if (!intent || intent.organizationId !== input.organizationId) throw new Error("intent_not_found");
      if (intent.platformUserId && input.bookingUserId && intent.platformUserId !== input.bookingUserId) {
        throw new Error("forbidden");
      }
      const normalized = input.verifyPhone.replace(/\D/g, "");
      const bookingPhone = input.bookingContactPhone.replace(/\D/g, "");
      if (!normalized || normalized !== bookingPhone) throw new Error("forbidden");
      return this.captureIntentSuccess(input.intentId, input.organizationId);
    },

    async captureIntentSuccess(intentId: string, organizationId: string) {
      const intent = await deps.port.findIntentById(intentId);
      if (!intent || intent.organizationId !== organizationId) {
        throw new Error("intent_not_found");
      }
      if (intent.status === "succeeded") {
        const payment = await deps.port.findPaymentByIntent(intent.id);
        return { intent, payment, alreadyProcessed: true as const };
      }

      await deps.port.updateIntentStatus(intent.id, "succeeded");
      const payment = await deps.port.createPaymentFromIntent({ ...intent, status: "succeeded" });

      await deps.port.appendHistoryEvent({
        organizationId,
        appointmentId: intent.appointmentId,
        platformUserId: intent.platformUserId,
        paymentId: payment.id,
        eventType: "payment_captured",
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        providerId: payment.providerId,
        status: payment.status,
        purpose: payment.purpose,
      });

      if (intent.appointmentId) {
        await deps.port.setAppointmentPaymentRef(intent.appointmentId, payment.id);
      }

      if (intent.appointmentId && deps.bookingEngine) {
        const appt = await deps.bookingEngine.getAppointment(intent.appointmentId);
        if (appt?.status === "awaiting_payment") {
          await deps.bookingEngine.transitionAppointmentStatus({
            appointmentId: intent.appointmentId,
            toStatus: "paid",
            payload: { source: "payment_capture" },
          });
          await deps.bookingEngine.transitionAppointmentStatus({
            appointmentId: intent.appointmentId,
            toStatus: "confirmed",
            payload: { source: "payment_confirmed" },
          });
        }
        if (deps.onAppointmentPaymentConfirmed) {
          await deps.onAppointmentPaymentConfirmed({
            appointmentId: intent.appointmentId,
            paymentId: payment.id,
            platformUserId: intent.platformUserId,
          });
        }
      }

      const patientPackageId = parsePatientPackageProductRef(intent.productRef);
      if (patientPackageId && deps.onPackagePaymentCaptured) {
        await deps.onPackagePaymentCaptured({
          patientPackageId,
          paymentId: payment.id,
          platformUserId: intent.platformUserId,
          organizationId,
        });
      }

      const productPurchaseId = parseProductPurchaseProductRef(intent.productRef);
      if (productPurchaseId && deps.onProductPaymentCaptured) {
        await deps.onProductPaymentCaptured({
          productPurchaseId,
          paymentId: payment.id,
          platformUserId: intent.platformUserId,
          organizationId,
        });
      }

      return { intent, payment, alreadyProcessed: false as const };
    },

    async processProviderWebhook(input: {
      organizationId: string;
      providerId: string;
      headers: Headers;
      bodyText: string;
    }) {
      const settings = await loadSettings();
      const provider = settings.providers.find((p) => p.id === input.providerId);
      if (!provider?.enabled) throw new Error("payment_provider_unavailable");
      const secret = provider.webhookSecret?.trim();
      if (!secret) throw new Error("webhook_secret_missing");

      const adapter = getPaymentProviderAdapter(input.providerId);
      const verified = adapter.verifyWebhook({
        headers: input.headers,
        bodyText: input.bodyText,
        webhookSecret: secret,
        providerConfig: provider,
      });

      const stored = await deps.port.recordProviderEvent({
        organizationId: input.organizationId,
        providerId: input.providerId,
        idempotencyKey: verified.idempotencyKey,
        eventType: verified.eventType,
        payloadJson: verified.payload,
      });
      if (!stored.inserted) {
        return { ok: true as const, duplicate: true as const };
      }

      if (verified.eventType === "payment.succeeded") {
        const intentId =
          typeof verified.payload.intentId === "string" ? verified.payload.intentId : null;
        const intent =
          (intentId ? await deps.port.findIntentById(intentId) : null) ??
          (await deps.port.findIntentByProviderRef(
            input.organizationId,
            verified.intentRef ?? String(verified.payload.intentRef ?? ""),
          ));
        if (intent) {
          await this.captureIntentSuccess(intent.id, input.organizationId);
        }
      }

      await deps.port.markProviderEventProcessed(stored.id);
      return { ok: true as const, duplicate: false as const };
    },

    async applyCancelPaymentOutcome(input: {
      appointmentId: string;
      organizationId: string;
      prepaymentRetained: boolean;
      prepaymentRefunded: boolean;
      reason?: string;
    }) {
      const payment = await deps.port.findPaymentByAppointment(input.appointmentId);
      if (!payment) return { ok: true as const, skipped: true as const };

      if (input.prepaymentRetained) {
        await deps.port.appendHistoryEvent({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          paymentId: payment.id,
          eventType: "prepayment_retained",
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          providerId: payment.providerId,
          comment: input.reason ?? null,
        });
        return { ok: true as const, skipped: false as const, action: "retained" as const };
      }

      if (input.prepaymentRefunded) {
        const settings = await loadSettings();
        const provider = resolveActiveProvider(settings, payment.providerId);
        const adapter = getPaymentProviderAdapter(provider.id);
        const idempotencyKey = `refund:${payment.id}:${input.appointmentId}`;
        const intent = await deps.port.findIntentById(payment.paymentIntentId);
        const refundResult = await adapter.refund({
          providerIntentRef: intent?.providerIntentRef ?? payment.paymentIntentId,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          idempotencyKey,
          providerConfig: provider,
        });
        const refund = await deps.port.createRefund({
          organizationId: input.organizationId,
          paymentId: payment.id,
          appointmentId: input.appointmentId,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          status: "succeeded",
          reason: input.reason,
          providerRefundRef: refundResult.providerRefundRef,
        });
        await deps.port.updatePaymentStatus(payment.id, "refunded");
        await deps.port.appendHistoryEvent({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          paymentId: payment.id,
          refundId: refund.id,
          eventType: "refund_succeeded",
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          providerId: payment.providerId,
          status: "succeeded",
          comment: input.reason ?? null,
        });
        return { ok: true as const, skipped: false as const, action: "refunded" as const };
      }

      return { ok: true as const, skipped: true as const };
    },

    async getAppointmentPaymentSummary(
      appointmentId: string,
      organizationId: string,
      appt?: BeAppointment | null,
      prepaymentContext?: PrepaymentResolveContext,
    ): Promise<AppointmentPaymentSummary | null> {
      const appointment =
        appt ?? (deps.bookingEngine ? await deps.bookingEngine.getAppointment(appointmentId) : null);
      if (!appointment || appointment.organizationId !== organizationId) return null;

      const servicePriceMinor = prepaymentContext?.servicePriceMinor ?? null;

      const quote =
        appointment.serviceId || prepaymentContext?.onlineCategory
          ? await this.resolvePrepayment({
              organizationId,
              serviceId: appointment.serviceId,
              onlineCategory: prepaymentContext?.onlineCategory ?? null,
              servicePriceMinor,
              currency: "RUB",
            })
          : null;

      const payment = await deps.port.findPaymentByAppointment(appointmentId);
      const intent =
        (payment ? await deps.port.findIntentById(payment.paymentIntentId) : null) ??
        (await deps.port.findLatestIntentByAppointment(appointmentId));
      const history = await deps.port.listHistoryForAppointment(appointmentId, organizationId);

      return {
        appointmentId,
        appointmentStatus: appointment.status,
        prepaymentQuote: quote,
        intent,
        payment,
        history,
      };
    },
  };
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;

export function createPaymentsConfigReader(
  getSetting: (key: "booking_payment_enabled" | "booking_payment_providers") => Promise<{ valueJson: unknown } | null>,
): PaymentsConfigReader {
  return {
    async getBookingPaymentSettings() {
      const enabledRow = await getSetting("booking_payment_enabled");
      const providersRow = await getSetting("booking_payment_providers");
      const enabled =
        enabledRow != null &&
        enabledRow.valueJson !== null &&
        typeof enabledRow.valueJson === "object" &&
        (enabledRow.valueJson as Record<string, unknown>).value === true;
      const parsed = parseBookingPaymentSettingsValue(providersRow?.valueJson ?? null);
      return { ...parsed, enabled };
    },
  };
}

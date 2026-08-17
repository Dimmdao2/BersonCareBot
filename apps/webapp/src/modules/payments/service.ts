import type { BeAppointment } from '@/modules/booking-engine/types';
import type { BookingEnginePort } from '@/modules/booking-engine/ports';
import { getPaymentProviderAdapter } from '@/infra/payments/paymentProviderRegistry';
import { parseBookingPaymentSettingsValue } from './bookingPaymentSettings';
import { quotePrepayment } from './prepaymentCalculator';
import type {
  PaymentCaptureUnitOfWork,
  PaymentsConfigReader,
  PaymentsPort,
  StoredPaymentProviderEvent,
} from './ports';
import type { AppointmentPaymentSummary, BookingPaymentSettings, PrepaymentQuote } from './types';
import type { ResolvePrepaymentParams } from './ports';
import type { PrepaymentResolveContext } from './prepaymentContextFromBooking';
import { parsePatientPackageProductRef } from '@/modules/memberships/patientPackageProductRef';
import { env } from '@/config/env';
import { routePaths } from '@/app-layer/routes/paths';
import { buildBookingPaymentReceipt } from './fiscalReceipt';

/**
 * The caller always computes a screen-specific return address; this is only the safety net for
 * the case it comes in blank — our own screen, never the provider's site (B0.3a/#1057).
 */
function resolveReturnUrl(returnUrl: string | null | undefined): string {
  return returnUrl?.trim() || `${env.APP_BASE_URL}${routePaths.patient}`;
}

function persistedProviderIntentRef(event: StoredPaymentProviderEvent): string | null {
  const explicit = event.intentRef?.trim();
  if (explicit) return explicit;

  const payload = event.payloadJson;
  const direct = (key: string) => {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  };
  if (event.providerId === 'cloudpayments') return direct('TransactionId');
  if (event.providerId === 'tinkoff') return direct('PaymentId');
  if (event.providerId === 'alfabank') return direct('mdOrder') ?? direct('orderId');
  if (event.providerId === 'yookassa') {
    const object = payload.object;
    if (object && typeof object === 'object' && !Array.isArray(object)) {
      const id = (object as Record<string, unknown>).id;
      if (typeof id === 'string' && id.trim()) return id.trim();
      if (typeof id === 'number' && Number.isFinite(id)) return String(id);
    }
  }
  return direct('intentRef') ?? direct('intentId');
}

export function createPaymentsService(deps: {
  port: PaymentsPort;
  config: PaymentsConfigReader;
  captureUnitOfWork: PaymentCaptureUnitOfWork;
  bookingEngine: Pick<
    BookingEnginePort,
    'getAppointment' | 'listAppointmentsByChainId' | 'transitionAppointmentStatus'
  > | null;
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
  /** Canonical tariff decision for creating new patient payment intents. Existing intents remain readable/capturable. */
  canCreatePaymentIntent?: (organizationId: string) => Promise<boolean>;
  syncServicePrepaymentApplicable?: (serviceId: string, applicable: boolean) => Promise<void>;
  /**
   * 3.2: physically refuses mechanic writes unless a passing mutation decision already ran in
   * this request (injected from `buildAppDeps.ts` as `assertMechanicWriteClearance`).
   */
  assertWriteClearance?: (mechanic: 'payments' | 'booking_prepayment') => void;
  /** Resolve the current payer email for fiscal receipts at the moment the intent is created. */
  resolvePayerEmail?: (platformUserId: string) => Promise<string | null>;
}) {
  async function loadSettings(organizationId?: string): Promise<BookingPaymentSettings> {
    return deps.config.getBookingPaymentSettings(organizationId);
  }

  async function resolveAppointmentPayment(
    appointmentId: string,
    organizationId: string,
    appointment?: BeAppointment | null,
  ) {
    const resolvedAppointment =
      appointment ??
      (deps.bookingEngine ? await deps.bookingEngine.getAppointment(appointmentId) : null);
    if (
      !resolvedAppointment ||
      resolvedAppointment.organizationId !== organizationId ||
      !resolvedAppointment.paymentRef
    ) {
      return null;
    }
    const payment = await deps.port.findPaymentById(resolvedAppointment.paymentRef, organizationId);
    if (!payment) return null;
    return { appointment: resolvedAppointment, payment };
  }

  async function resolveAppointmentAmountMinor(
    organizationId: string,
    payment: { id: string; amountMinor: number },
  ): Promise<number> {
    const appointmentCount = await deps.port.countAppointmentsByPaymentRef(
      payment.id,
      organizationId,
    );
    if (appointmentCount <= 1) return payment.amountMinor;
    if (payment.amountMinor % appointmentCount !== 0) {
      throw new Error('combined_payment_amount_not_divisible');
    }
    return payment.amountMinor / appointmentCount;
  }

  function providerHasCredentials(provider: BookingPaymentSettings['providers'][number]): boolean {
    const apiKey = provider.apiKey?.trim();
    if (!apiKey) return false;
    const identifier =
      provider.shopId?.trim() ||
      provider.terminalKey?.trim() ||
      provider.merchantLogin?.trim() ||
      provider.publicId?.trim();
    return Boolean(identifier);
  }

  function resolveActiveProvider(settings: BookingPaymentSettings, providerId?: string) {
    const id = providerId?.trim() || settings.defaultProviderId;
    const provider = settings.providers.find((p) => p.id === id && p.enabled);
    // A provider toggled on without credentials is not actually usable — fail here, before an
    // outbound call to the provider, with the same code callers already treat as "not configured".
    if (!provider || !providerHasCredentials(provider)) {
      throw new Error('payment_provider_unavailable');
    }
    if (provider.id === 'yookassa' && !settings.fiscalVatCode) {
      throw new Error('payment_provider_unavailable');
    }
    return provider;
  }

  async function captureIntentSuccessInUnitOfWork(intentId: string, organizationId: string) {
    const intent = await deps.port.lockIntentForCapture(intentId, organizationId);
    if (!intent) throw new Error('intent_not_found');

    const wasSucceeded = intent.status === 'succeeded';
    const succeededIntent = wasSucceeded
      ? intent
      : ((await deps.port.updateIntentStatus(intent.id, 'succeeded', organizationId)) ?? {
          ...intent,
          status: 'succeeded',
        });
    const existingPayment = await deps.port.findPaymentByIntent(intent.id);
    const payment =
      existingPayment ??
      (await deps.port.createPaymentFromIntent({ ...succeededIntent, status: 'succeeded' }));

    if (!(await deps.port.hasCapturedHistoryEvent(payment.id, organizationId))) {
      await deps.port.appendHistoryEvent({
        organizationId,
        appointmentId: intent.appointmentId,
        platformUserId: intent.platformUserId,
        paymentId: payment.id,
        eventType: 'payment_captured',
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        providerId: payment.providerId,
        status: payment.status,
        purpose: payment.purpose,
      });
    }

    const confirmedAppointments: Array<{
      appointmentId: string;
      paymentId: string;
      platformUserId: string | null;
    }> = [];
    if (intent.appointmentId && deps.bookingEngine) {
      const appt = await deps.bookingEngine.getAppointment(intent.appointmentId);
      const appointments = appt?.chainId
        ? await deps.bookingEngine.listAppointmentsByChainId({
            organizationId,
            chainId: appt.chainId,
          })
        : appt
          ? [appt]
          : [];
      if (appointments.length === 0) {
        await deps.port.setAppointmentPaymentRef(intent.appointmentId, payment.id, organizationId);
      }
      for (const appointment of appointments) {
        await deps.port.setAppointmentPaymentRef(appointment.id, payment.id, organizationId);
        let status = appointment.status;
        if (status === 'awaiting_payment') {
          await deps.bookingEngine.transitionAppointmentStatus({
            appointmentId: appointment.id,
            toStatus: 'paid',
            payload: { source: 'payment_capture', paymentId: payment.id },
          });
          status = 'paid';
        }
        if (status === 'paid') {
          await deps.bookingEngine.transitionAppointmentStatus({
            appointmentId: appointment.id,
            toStatus: 'confirmed',
            payload: { source: 'payment_confirmed', paymentId: payment.id },
          });
        }
        confirmedAppointments.push({
          appointmentId: appointment.id,
          paymentId: payment.id,
          platformUserId: intent.platformUserId,
        });
      }
    } else if (intent.appointmentId) {
      await deps.port.setAppointmentPaymentRef(intent.appointmentId, payment.id, organizationId);
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

    return {
      result: {
        intent: succeededIntent,
        payment,
        alreadyProcessed: wasSucceeded && existingPayment !== null,
      },
      confirmedAppointments,
    };
  }

  async function captureIntentSuccess(intentId: string, organizationId: string) {
    const captured = await deps.captureUnitOfWork.run(organizationId, () =>
      captureIntentSuccessInUnitOfWork(intentId, organizationId),
    );
    if (deps.onAppointmentPaymentConfirmed) {
      for (const appointment of captured.confirmedAppointments) {
        await deps.onAppointmentPaymentConfirmed(appointment);
      }
    }
    return captured.result;
  }

  async function resolveStoredProviderEventIntent(event: StoredPaymentProviderEvent) {
    const payloadIntentId = event.payloadJson.intentId;
    if (typeof payloadIntentId === 'string' && payloadIntentId.trim()) {
      const intent = await deps.port.findIntentById(payloadIntentId.trim());
      if (intent?.organizationId === event.organizationId) return intent;
    }

    const providerIntentRef = persistedProviderIntentRef(event);
    if (!providerIntentRef) return null;
    return deps.port.findIntentByProviderRef(event.organizationId, providerIntentRef);
  }

  return {
    async getSettings(organizationId?: string): Promise<BookingPaymentSettings> {
      return loadSettings(organizationId);
    },

    async getPrepaymentAvailability(
      organizationId: string,
    ): Promise<
      | { available: true }
      | { available: false; reason: 'payments_disabled' | 'payment_provider_unavailable' }
    > {
      const settings = await loadSettings(organizationId);
      if (!settings.enabled) return { available: false, reason: 'payments_disabled' };
      try {
        resolveActiveProvider(settings);
        return { available: true };
      } catch (error) {
        if (error instanceof Error && error.message === 'payment_provider_unavailable') {
          return { available: false, reason: 'payment_provider_unavailable' };
        }
        throw error;
      }
    },

    async resolvePrepayment(params: ResolvePrepaymentParams): Promise<PrepaymentQuote> {
      const settings = await loadSettings(params.organizationId);
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
        currency: params.currency ?? policy?.currency ?? 'RUB',
        paymentsGloballyEnabled: settings.enabled,
      });
    },

    async listPrepaymentPolicies(organizationId: string) {
      return deps.port.listPrepaymentPolicies(organizationId);
    },

    async upsertPrepaymentPolicy(input: Parameters<PaymentsPort['upsertPrepaymentPolicy']>[0]) {
      deps.assertWriteClearance?.('booking_prepayment');
      const row = await deps.port.upsertPrepaymentPolicy(input);
      if (input.serviceId && deps.syncServicePrepaymentApplicable) {
        await deps.syncServicePrepaymentApplicable(
          input.serviceId,
          input.mode !== 'disabled' && (input.isActive ?? true),
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
      const resolved = await resolveAppointmentPayment(input.appointmentId, input.organizationId);
      if (!resolved) return { ok: true as const, skipped: true as const };
      const { appointment, payment } = resolved;
      const appointmentAmountMinor = await resolveAppointmentAmountMinor(
        appointment.organizationId,
        payment,
      );
      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        appointmentId: input.appointmentId,
        platformUserId: input.platformUserId ?? null,
        paymentId: payment.id,
        eventType: 'prepayment_carried_on_reschedule',
        amountMinor: appointmentAmountMinor,
        currency: payment.currency,
        providerId: payment.providerId,
        comment: input.newStartAt,
      });
      return { ok: true as const, skipped: false as const };
    },

    async listPaymentHistoryForUser(platformUserId: string, organizationId: string) {
      return deps.port.listHistoryForUser(platformUserId, organizationId);
    },

    async resolveIntentOrganizationId(intentId: string) {
      const intent = await deps.port.findIntentById(intentId);
      return intent?.organizationId ?? null;
    },

    /** Org-scoped: never returns another organization's intent, even for a valid id. */
    async getIntentForOrganization(intentId: string, organizationId: string) {
      const intent = await deps.port.findIntentById(intentId);
      if (!intent || intent.organizationId !== organizationId) return null;
      return intent;
    },

    async resolveProviderWebhookOrganizationId(input: {
      providerId: string;
      idempotencyKey: string;
      eventType: string;
    }) {
      const providerId = input.providerId.trim();
      const idempotencyKey = input.idempotencyKey.trim();
      const eventType = input.eventType.trim();
      if (!providerId || !idempotencyKey || !eventType) return null;
      return deps.port.resolveProviderWebhookOrganization(providerId, idempotencyKey, eventType);
    },

    async createAppointmentPaymentIntent(input: {
      organizationId: string;
      appointmentId: string;
      platformUserId: string;
      amountMinor: number;
      currency: string;
      idempotencyKey: string;
      providerId?: string;
      returnUrl: string;
    }) {
      deps.assertWriteClearance?.('payments');
      const settings = await loadSettings(input.organizationId);
      if (!settings.enabled) throw new Error('payments_disabled');
      const provider = resolveActiveProvider(settings, input.providerId);
      const adapter = getPaymentProviderAdapter(provider.id);
      const existing = await deps.port.findIntentByIdempotency(
        input.organizationId,
        input.idempotencyKey,
      );
      if (existing) return existing;
      if (!((await deps.canCreatePaymentIntent?.(input.organizationId)) ?? true)) {
        throw new Error('payments_disabled');
      }

      const created = await adapter.createIntent({
        amountMinor: input.amountMinor,
        currency: input.currency,
        idempotencyKey: input.idempotencyKey,
        payerRef: `platform_user:${input.platformUserId}`,
        purpose: 'appointment_prepayment',
        subjectRef: input.appointmentId,
        returnUrl: resolveReturnUrl(input.returnUrl),
        receipt: buildBookingPaymentReceipt({
          settings,
          providerId: provider.id,
          customerEmail: await deps.resolvePayerEmail?.(input.platformUserId),
          description: 'Предоплата записи',
          amountMinor: input.amountMinor,
        }),
        metadata: {
          appointmentId: input.appointmentId,
        },
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
        checkoutUrl: created.checkoutUrl ?? null,
      });

      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        appointmentId: input.appointmentId,
        platformUserId: input.platformUserId,
        eventType: 'intent_created',
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
      returnUrl: string;
    }) {
      deps.assertWriteClearance?.('payments');
      const settings = await loadSettings(input.organizationId);
      if (!settings.enabled) throw new Error('payments_disabled');
      const provider = resolveActiveProvider(settings, input.providerId);
      const adapter = getPaymentProviderAdapter(provider.id);
      const existing = await deps.port.findIntentByIdempotency(
        input.organizationId,
        input.idempotencyKey,
      );
      if (existing) return existing;
      if (!((await deps.canCreatePaymentIntent?.(input.organizationId)) ?? true)) {
        throw new Error('payments_disabled');
      }

      const productRef = `patient_package:${input.patientPackageId}`;
      const created = await adapter.createIntent({
        amountMinor: input.amountMinor,
        currency: input.currency,
        idempotencyKey: input.idempotencyKey,
        payerRef: `platform_user:${input.platformUserId}`,
        purpose: 'package_purchase',
        subjectRef: productRef,
        returnUrl: resolveReturnUrl(input.returnUrl),
        receipt: buildBookingPaymentReceipt({
          settings,
          providerId: provider.id,
          customerEmail: await deps.resolvePayerEmail?.(input.platformUserId),
          description: 'Оплата абонемента',
          amountMinor: input.amountMinor,
        }),
        metadata: {
          patientPackageId: input.patientPackageId,
        },
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
        purpose: 'package_purchase',
        providerIntentRef: created.providerIntentRef,
        checkoutUrl: created.checkoutUrl ?? null,
        metadataJson: { patientPackageId: input.patientPackageId },
      });

      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        platformUserId: input.platformUserId,
        eventType: 'package_intent_created',
        amountMinor: input.amountMinor,
        currency: input.currency,
        providerId: provider.id,
        status: intent.status,
        purpose: intent.purpose,
        payloadJson: { patientPackageId: input.patientPackageId, productRef },
      });

      return intent;
    },

    async captureIntentForPatient(
      intentId: string,
      organizationId: string,
      platformUserId: string,
    ) {
      const intent = await deps.port.findIntentById(intentId);
      if (!intent || intent.organizationId !== organizationId) throw new Error('intent_not_found');
      if (intent.platformUserId !== platformUserId) throw new Error('forbidden');
      return captureIntentSuccess(intentId, organizationId);
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
      if (!intent || intent.organizationId !== input.organizationId)
        throw new Error('intent_not_found');
      if (
        intent.platformUserId &&
        input.bookingUserId &&
        intent.platformUserId !== input.bookingUserId
      ) {
        throw new Error('forbidden');
      }
      const normalized = input.verifyPhone.replace(/\D/g, '');
      const bookingPhone = input.bookingContactPhone.replace(/\D/g, '');
      if (!normalized || normalized !== bookingPhone) throw new Error('forbidden');
      return captureIntentSuccess(input.intentId, input.organizationId);
    },

    async captureIntentSuccess(intentId: string, organizationId: string) {
      return captureIntentSuccess(intentId, organizationId);
    },

    async processProviderWebhook(input: {
      organizationId: string;
      providerId: string;
      headers: Headers;
      bodyText: string;
    }) {
      const settings = await loadSettings(input.organizationId);
      const provider = settings.providers.find((p) => p.id === input.providerId);
      if (!provider?.enabled) throw new Error('payment_provider_unavailable');
      const secret = provider.webhookSecret?.trim();
      if (!secret) throw new Error('webhook_secret_missing');

      const adapter = getPaymentProviderAdapter(input.providerId);
      const verified = await adapter.verifyWebhook({
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
        intentRef: verified.intentRef?.trim() || null,
        payloadJson: verified.payload,
      });
      if (!stored.inserted && stored.processedAt) {
        return { ok: true as const, duplicate: true as const };
      }
      if (!stored.id) throw new Error('provider_event_persist_failed');

      const storedIntent = await resolveStoredProviderEventIntent(stored);
      const captureKey = storedIntent ? `intent:${storedIntent.id}` : `event:${stored.id}`;

      return deps.captureUnitOfWork.runSerializedPostCommit(
        input.organizationId,
        captureKey,
        async () => {
          const current = await deps.port.getProviderEventById(stored.id, input.organizationId);
          if (!current) throw new Error('provider_event_not_found');
          if (current.processedAt) {
            return { ok: true as const, duplicate: true as const };
          }

          if (current.eventType === 'payment.succeeded') {
            const intent = await resolveStoredProviderEventIntent(current);
            if (intent) await captureIntentSuccess(intent.id, input.organizationId);
          }

          await deps.port.markProviderEventProcessed(current.id, input.organizationId);
          return { ok: true as const, duplicate: !stored.inserted };
        },
      );
    },

    async applyCancelPaymentOutcome(input: {
      appointmentId: string;
      organizationId: string;
      prepaymentRetained: boolean;
      prepaymentRefunded: boolean;
      reason?: string;
    }) {
      const resolved = await resolveAppointmentPayment(input.appointmentId, input.organizationId);
      if (!resolved) return { ok: true as const, skipped: true as const };
      const { appointment, payment } = resolved;
      const appointmentAmountMinor = await resolveAppointmentAmountMinor(
        appointment.organizationId,
        payment,
      );

      if (input.prepaymentRetained) {
        await deps.port.appendHistoryEvent({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          paymentId: payment.id,
          eventType: 'prepayment_retained',
          amountMinor: appointmentAmountMinor,
          currency: payment.currency,
          providerId: payment.providerId,
          comment: input.reason ?? null,
        });
        return { ok: true as const, skipped: false as const, action: 'retained' as const };
      }

      if (input.prepaymentRefunded) {
        const settings = await loadSettings(input.organizationId);
        const provider = resolveActiveProvider(settings, payment.providerId);
        const adapter = getPaymentProviderAdapter(provider.id);
        const idempotencyKey = `refund:${payment.id}:${input.appointmentId}`;
        const intent = await deps.port.findIntentById(payment.paymentIntentId);
        const refundResult = await adapter.refund({
          providerIntentRef: intent?.providerIntentRef ?? payment.paymentIntentId,
          amountMinor: appointmentAmountMinor,
          currency: payment.currency,
          idempotencyKey,
          providerConfig: provider,
        });
        const refund = await deps.port.createRefund({
          organizationId: input.organizationId,
          paymentId: payment.id,
          appointmentId: input.appointmentId,
          amountMinor: appointmentAmountMinor,
          currency: payment.currency,
          status: 'succeeded',
          reason: input.reason,
          providerRefundRef: refundResult.providerRefundRef,
        });
        const refundedAmount = await deps.port.getSucceededRefundedAmount(
          payment.id,
          input.organizationId,
        );
        if (refundedAmount >= payment.amountMinor) {
          await deps.port.updatePaymentStatus(payment.id, 'refunded', input.organizationId);
        }
        await deps.port.appendHistoryEvent({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          paymentId: payment.id,
          refundId: refund.id,
          eventType: 'refund_succeeded',
          amountMinor: appointmentAmountMinor,
          currency: payment.currency,
          providerId: payment.providerId,
          status: 'succeeded',
          comment: input.reason ?? null,
        });
        return { ok: true as const, skipped: false as const, action: 'refunded' as const };
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
        appt ??
        (deps.bookingEngine ? await deps.bookingEngine.getAppointment(appointmentId) : null);
      if (!appointment || appointment.organizationId !== organizationId) return null;

      const servicePriceMinor = prepaymentContext?.servicePriceMinor ?? null;

      const quote =
        appointment.serviceId || prepaymentContext?.onlineCategory
          ? await this.resolvePrepayment({
              organizationId,
              serviceId: appointment.serviceId,
              onlineCategory: prepaymentContext?.onlineCategory ?? null,
              servicePriceMinor,
              currency: 'RUB',
            })
          : null;

      const payment =
        (await resolveAppointmentPayment(appointmentId, organizationId, appointment))?.payment ??
        null;
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
  getSetting: (
    key: 'booking_payment_enabled' | 'booking_payment_providers',
    organizationId?: string,
  ) => Promise<{ valueJson: unknown } | null>,
): PaymentsConfigReader {
  return {
    async getBookingPaymentSettings(organizationId) {
      const enabledRow = await getSetting('booking_payment_enabled', organizationId);
      const providersRow = await getSetting('booking_payment_providers', organizationId);
      const enabled =
        enabledRow != null &&
        enabledRow.valueJson !== null &&
        typeof enabledRow.valueJson === 'object' &&
        (enabledRow.valueJson as Record<string, unknown>).value === true;
      const parsed = parseBookingPaymentSettingsValue(providersRow?.valueJson ?? null);
      return { ...parsed, enabled };
    },
  };
}

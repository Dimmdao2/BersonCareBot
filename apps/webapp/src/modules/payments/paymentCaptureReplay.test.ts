import { describe, expect, it, vi } from 'vitest';
import { createPaymentsService } from './service';
import type { PaymentIntentRecord, PaymentRecord } from './types';

type CaptureState = {
  intentStatus: string;
  payment: PaymentRecord | null;
  captureHistoryCount: number;
  appointmentStatus: string | null;
  packageActive: boolean;
  productUserCreated: boolean;
  productGrantActive: boolean;
  productActive: boolean;
};

function cloneState(state: CaptureState): CaptureState {
  return { ...state, payment: state.payment ? { ...state.payment } : null };
}

function createCrashHarness(input: {
  productRef?: string | null;
  appointmentId?: string | null;
  failAfter: string;
}) {
  const intent: PaymentIntentRecord = {
    id: 'intent-1',
    organizationId: 'org-1',
    idempotencyKey: 'capture-1',
    providerId: 'mock',
    appointmentId: input.appointmentId ?? null,
    platformUserId: 'user-1',
    productRef: input.productRef ?? null,
    amountMinor: 10_000,
    currency: 'RUB',
    status: 'pending',
    purpose: input.productRef ? 'product_purchase' : 'appointment_prepayment',
    providerIntentRef: 'provider-intent-1',
  };
  let state: CaptureState = {
    intentStatus: 'pending',
    payment: null,
    captureHistoryCount: 0,
    appointmentStatus: input.appointmentId ? 'awaiting_payment' : null,
    packageActive: false,
    productUserCreated: false,
    productGrantActive: false,
    productActive: false,
  };
  let failAfter: string | null = input.failAfter;
  const maybeCrash = (point: string) => {
    if (failAfter !== point) return;
    failAfter = null;
    throw new Error(`crash_after_${point}`);
  };

  const port = {
    lockIntentForCapture: vi.fn(async () => ({ ...intent, status: state.intentStatus })),
    updateIntentStatus: vi.fn(async () => {
      state.intentStatus = 'succeeded';
      maybeCrash('intent');
      return { ...intent, status: 'succeeded' };
    }),
    findPaymentByIntent: vi.fn(async () => state.payment),
    createPaymentFromIntent: vi.fn(async () => {
      state.payment = {
        id: 'payment-1',
        organizationId: 'org-1',
        paymentIntentId: intent.id,
        appointmentId: intent.appointmentId,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        status: 'captured',
        providerId: intent.providerId,
        purpose: intent.purpose,
      };
      maybeCrash('payment');
      return state.payment;
    }),
    hasCapturedHistoryEvent: vi.fn(async () => state.captureHistoryCount > 0),
    appendHistoryEvent: vi.fn(async () => {
      state.captureHistoryCount += 1;
      maybeCrash('history');
    }),
    setAppointmentPaymentRef: vi.fn(async () => undefined),
  };
  const bookingEngine = input.appointmentId
    ? {
        getAppointment: vi.fn(async () => ({
          id: input.appointmentId,
          organizationId: 'org-1',
          chainId: null,
          status: state.appointmentStatus,
        })),
        listAppointmentsByChainId: vi.fn(),
        transitionAppointmentStatus: vi.fn(async ({ toStatus }: { toStatus: string }) => {
          state.appointmentStatus = toStatus;
          maybeCrash(`appointment_${toStatus}`);
          return {};
        }),
      }
    : null;
  const captureUnitOfWork = {
    async run<T>(_organizationId: string, fn: () => Promise<T>): Promise<T> {
      const before = cloneState(state);
      try {
        return await fn();
      } catch (error) {
        state = before;
        throw error;
      }
    },
    async runSerializedPostCommit<T>(
      _organizationId: string,
      _captureKey: string,
      fn: () => Promise<T>,
    ): Promise<T> {
      return fn();
    },
  };
  const service = createPaymentsService({
    port: port as never,
    config: {
      getBookingPaymentSettings: async () => ({
        enabled: true,
        defaultProviderId: 'mock',
        providers: [],
      }),
    },
    captureUnitOfWork,
    bookingEngine: bookingEngine as never,
    onPackagePaymentCaptured: async () => {
      if (!state.packageActive) state.packageActive = true;
      maybeCrash('package');
    },
    onProductPaymentCaptured: async () => {
      if (!state.productUserCreated) state.productUserCreated = true;
      maybeCrash('product_user');
      if (!state.productGrantActive) state.productGrantActive = true;
      maybeCrash('product_grant');
      if (!state.productActive) state.productActive = true;
      maybeCrash('product');
    },
  });

  return {
    service,
    state: () => cloneState(state),
    initialState: (): CaptureState => ({
      intentStatus: 'pending',
      payment: null,
      captureHistoryCount: 0,
      appointmentStatus: input.appointmentId ? 'awaiting_payment' : null,
      packageActive: false,
      productUserCreated: false,
      productGrantActive: false,
      productActive: false,
    }),
  };
}

describe('payment capture crash/replay', () => {
  it.each(['intent', 'payment', 'history', 'appointment_paid', 'appointment_confirmed'])(
    'rolls back an appointment capture crash after %s and completes exactly once on replay',
    async (failAfter) => {
      const harness = createCrashHarness({ appointmentId: 'appointment-1', failAfter });

      await expect(harness.service.captureIntentSuccess('intent-1', 'org-1')).rejects.toThrow(
        `crash_after_${failAfter}`,
      );
      expect(harness.state()).toEqual(harness.initialState());

      await harness.service.captureIntentSuccess('intent-1', 'org-1');
      await harness.service.captureIntentSuccess('intent-1', 'org-1');
      expect(harness.state()).toMatchObject({
        intentStatus: 'succeeded',
        captureHistoryCount: 1,
        appointmentStatus: 'confirmed',
      });
      expect(harness.state().payment?.id).toBe('payment-1');
    },
  );

  it.each([
    ['package', 'patient_package:package-1', 'packageActive'],
    ['product', 'product_purchase:purchase-1', 'productActive'],
    ['product_user', 'product_purchase:purchase-1', 'productUserCreated'],
    ['product_grant', 'product_purchase:purchase-1', 'productGrantActive'],
  ] as const)(
    'rolls back %s fulfillment and completes it exactly once on replay',
    async (failAfter, productRef, field) => {
      const harness = createCrashHarness({ productRef, failAfter });

      await expect(harness.service.captureIntentSuccess('intent-1', 'org-1')).rejects.toThrow(
        `crash_after_${failAfter}`,
      );
      expect(harness.state()).toEqual(harness.initialState());

      await harness.service.captureIntentSuccess('intent-1', 'org-1');
      await harness.service.captureIntentSuccess('intent-1', 'org-1');
      expect(harness.state()[field]).toBe(true);
      expect(harness.state().captureHistoryCount).toBe(1);
    },
  );
});

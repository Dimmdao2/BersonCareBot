import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import type { ClientIdentity } from '@/modules/doctor-clients/ports';
import type { PatientPayment } from '@/modules/patient-payments/ports';
import type { PaymentProviderPort } from '@/modules/payments/providerPort';
import { env } from '@/config/env';
import { routePaths } from '@/app-layer/routes/paths';

type AppDeps = ReturnType<typeof import('@/app-layer/di/buildAppDeps').buildAppDeps>;
type RequireDoctorWorkspace =
  typeof import('@/app-layer/guards/requireRole').requireDoctorWorkspaceApiContext;
type RequireEntitlement =
  typeof import('@/app-layer/guards/requireEntitlement').requireEntitlementForMutation;

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn<typeof import('@/app-layer/di/buildAppDeps').buildAppDeps>(),
  requireDoctorWorkspace: vi.fn<RequireDoctorWorkspace>(),
  requireEntitlement: vi.fn<RequireEntitlement>(),
  getClientIdentity: vi.fn<AppDeps['doctorClientsPort']['getClientIdentityForOrganization']>(),
  createCharge: vi.fn<AppDeps['acquiringGateway']['createCharge']>(),
  recordAcquiringCharge: vi.fn<AppDeps['patientPayments']['recordAcquiringCharge']>(),
  getPaymentSettings: vi.fn<NonNullable<AppDeps['payments']>['getSettings']>(),
  resolvePaymentOrganization:
    vi.fn<AppDeps['patientPayments']['resolveOrganizationIdByProviderPaymentId']>(),
  handleWebhook: vi.fn<AppDeps['patientPayments']['handleAcquiringWebhookEvent']>(),
  getPaymentProviderAdapter:
    vi.fn<typeof import('@/infra/payments/paymentProviderRegistry').getPaymentProviderAdapter>(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: fakes.buildAppDeps,
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspace,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: fakes.requireEntitlement,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: <T>(
    _ctx: unknown,
    _source: string,
    callback: () => Promise<T>,
  ): Promise<T> => callback(),
}));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));
vi.mock('@bersoncare/db-principal', () => ({
  runWithDbOrganizationPrincipal: <T>(_organizationId: string, callback: () => T): T => callback(),
}));
vi.mock('@/infra/payments/paymentProviderRegistry', () => ({
  getPaymentProviderAdapter: fakes.getPaymentProviderAdapter,
}));

import { POST as chargePatient } from '@/app/api/doctor/patients/[userId]/acquiring-charge/route';
import { POST as receivePatientWebhook } from '@/app/api/payments/patient-acquiring-webhook/[provider]/route';
import { createRegistryAcquiringGateway } from '@/infra/payments/registryAcquiringGateway';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000001074';
const DOCTOR_ID = '00000000-0000-4000-8000-000000002074';
const PATIENT_ID = '00000000-0000-4000-8000-000000003074';

const doctorContext: DoctorWorkspaceAccessContext = {
  session: {
    user: {
      userId: DOCTOR_ID,
      role: 'doctor',
      displayName: 'Acquiring route doctor',
      bindings: {},
    },
    issuedAt: 1_790_000_000,
    expiresAt: 1_790_043_200,
  },
  organizationId: ORGANIZATION_ID,
  membershipId: 'membership-1074',
  membershipRole: 'doctor',
  specialistId: 'specialist-1074',
  canManageOrganization: false,
  canManageAllSpecialists: false,
  canAccessClinicalWorkspace: true,
  doctorScreensDisabled: false,
  capabilities: ['clinical.workspace'],
};

const clientIdentity: ClientIdentity = {
  userId: PATIENT_ID,
  displayName: 'Acquiring route patient',
  phone: null,
  bindings: {},
  createdAt: '2026-07-30T00:00:00.000Z',
  isBlocked: false,
  blockedReason: null,
  isArchived: false,
  channelBindingDates: {},
};

const pendingPayment: PatientPayment = {
  id: '00000000-0000-4000-8000-000000004074',
  organizationId: ORGANIZATION_ID,
  patientUserId: PATIENT_ID,
  amountMinor: 12_345,
  currency: 'RUB',
  kind: 'acquiring',
  status: 'pending',
  comment: null,
  service: null,
  visitId: null,
  provider: 'yookassa',
  providerPaymentId: 'provider-payment-1074',
  createdBy: DOCTOR_ID,
  createdAt: '2026-07-30T00:00:00.000Z',
};

const fakeDeps = {
  doctorClientsPort: {
    getClientIdentityForOrganization: fakes.getClientIdentity,
  },
  acquiringGateway: {
    createCharge: fakes.createCharge,
  },
  patientPayments: {
    recordAcquiringCharge: fakes.recordAcquiringCharge,
    resolveOrganizationIdByProviderPaymentId: fakes.resolvePaymentOrganization,
    handleAcquiringWebhookEvent: fakes.handleWebhook,
  },
  payments: {
    getSettings: fakes.getPaymentSettings,
  },
} as unknown as AppDeps;

function chargeRequest(idempotencyKey?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (idempotencyKey !== undefined) {
    headers.set('idempotency-key', idempotencyKey);
  }
  return new Request(
    `https://app.example.test/api/doctor/patients/${PATIENT_ID}/acquiring-charge`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        amountMinor: 12_345,
        currency: 'RUB',
        description: 'Test charge',
      }),
    },
  );
}

function invokeCharge(request = chargeRequest()) {
  return chargePatient(request, {
    params: Promise.resolve({ userId: PATIENT_ID }),
  });
}

function webhookRequest(bodyText: string): Request {
  return new Request('https://app.example.test/api/payments/patient-acquiring-webhook/alfabank', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: bodyText,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getPaymentProviderAdapter.mockReturnValue({
    createIntent: vi.fn(),
    refund: vi.fn(),
    inspectWebhook: vi.fn(),
    verifyWebhook: vi.fn().mockRejectedValue(new Error('invalid_webhook_signature')),
  });
  fakes.buildAppDeps.mockReturnValue(fakeDeps);
  fakes.requireDoctorWorkspace.mockResolvedValue({
    ok: true,
    ctx: doctorContext,
  });
  fakes.requireEntitlement.mockResolvedValue({ ok: true });
  fakes.getClientIdentity.mockResolvedValue(clientIdentity);
  fakes.createCharge.mockResolvedValue({
    ok: true,
    providerPaymentId: 'provider-payment-1074',
    redirectUrl: 'https://checkout.example.test/1074',
  });
  fakes.recordAcquiringCharge.mockResolvedValue(pendingPayment);
  fakes.getPaymentSettings.mockResolvedValue({
    enabled: true,
    defaultProviderId: 'alfabank',
    providers: [
      {
        id: 'alfabank',
        label: 'Alfa-Bank',
        enabled: true,
        webhookSecret: 'webhook-secret-1074',
      },
    ],
  });
  fakes.resolvePaymentOrganization.mockResolvedValue(null);
  fakes.handleWebhook.mockResolvedValue({ ok: true });
});

describe('patient acquiring charge HTTP boundary', () => {
  it('does not accept patient money when the payments mechanic is disabled', async () => {
    fakes.requireEntitlement.mockResolvedValue({
      ok: false,
      response: Response.json(
        { ok: false, error: 'entitlement_required', mechanic: 'payments' },
        { status: 403 },
      ),
    } as never);

    const response = await invokeCharge(chargeRequest('charge-1074-disabled'));

    expect(response.status).toBe(403);
    expect(fakes.createCharge).not.toHaveBeenCalled();
    expect(fakes.recordAcquiringCharge).not.toHaveBeenCalled();
  });

  it('returns not found without charging a patient outside the doctor workspace', async () => {
    fakes.getClientIdentity.mockResolvedValue(null);

    const response = await invokeCharge(chargeRequest('charge-1074-foreign-patient'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(fakes.createCharge).not.toHaveBeenCalled();
  });

  it('forwards a valid caller-owned idempotency key with the charge identity', async () => {
    const response = await invokeCharge(chargeRequest('charge-1074-stable'));

    expect(response.status).toBe(201);
    expect(fakes.createCharge).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      patientUserId: PATIENT_ID,
      amountMinor: 12_345,
      currency: 'RUB',
      idempotencyKey: 'charge-1074-stable',
      description: 'Test charge',
      returnUrl: `${env.APP_BASE_URL}${routePaths.purchases}`,
    });
    expect(fakes.getPaymentSettings).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('uses the doctor workspace provider settings without the route making an external request', async () => {
    const getConfig = vi.fn(async (organizationId: string) => {
      expect(organizationId).toBe(ORGANIZATION_ID);
      return {
        enabled: true,
        defaultProviderId: 'safe-test-provider',
        providers: [{ id: 'safe-test-provider', label: 'Safe test provider', enabled: true }],
      };
    });
    const createIntent = vi.fn<PaymentProviderPort['createIntent']>().mockResolvedValue({
      providerIntentRef: 'safe-test-intent-1074',
      checkoutUrl: 'https://checkout.example.test/safe-test-intent-1074',
    });
    const adapter: PaymentProviderPort = {
      createIntent,
      refund: vi.fn(),
      inspectWebhook: vi.fn(),
      verifyWebhook: vi.fn(),
    };
    fakes.getPaymentProviderAdapter.mockReturnValue(adapter);
    const gateway = createRegistryAcquiringGateway({ getConfig });
    fakes.buildAppDeps.mockReturnValue({
      ...fakeDeps,
      acquiringGateway: gateway,
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await invokeCharge(chargeRequest('charge-1074-org-provider'));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      redirectUrl: 'https://checkout.example.test/safe-test-intent-1074',
    });
    expect(getConfig).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(createIntent).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fakes.recordAcquiringCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        providerPaymentId: 'safe-test-intent-1074',
      }),
    );
    fetchSpy.mockRestore();
  });

  it('generates a UUID idempotency key when an older caller omits the header', async () => {
    const response = await invokeCharge();

    expect(response.status).toBe(201);
    const input = fakes.createCharge.mock.calls[0]?.[0];
    expect(z.string().uuid().safeParse(input?.idempotencyKey).success).toBe(true);
  });

  it('does not report public success or write a pending record on provider failure', async () => {
    fakes.createCharge.mockResolvedValue({
      ok: false,
      reason: 'provider_unavailable',
    });

    const response = await invokeCharge(chargeRequest('charge-1074-provider-error'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      reason: 'provider_unavailable',
    });
    expect(fakes.recordAcquiringCharge).not.toHaveBeenCalled();
  });
});

describe('patient acquiring webhook HTTP boundary', () => {
  it.each([
    ['a missing checksum', 'mdOrder=alfa-order-1074&orderNumber=charge-1074&status=2'],
    [
      'an invalid checksum',
      'mdOrder=alfa-order-1074&orderNumber=charge-1074&status=2&checksum=not-valid',
    ],
  ])('rejects %s before payment lookup', async (_case, bodyText) => {
    const response = await receivePatientWebhook(webhookRequest(bodyText), {
      params: Promise.resolve({ provider: 'alfabank' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'invalid_webhook_signature',
    });
    expect(fakes.resolvePaymentOrganization).not.toHaveBeenCalled();
  });
});

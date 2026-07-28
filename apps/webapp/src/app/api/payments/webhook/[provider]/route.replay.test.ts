import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { StoredPaymentProviderEvent } from '@/modules/payments/ports';
import { createPaymentsConfigReader, createPaymentsService } from '@/modules/payments/service';

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));

import { createPaymentsWebhookPost } from './route';

const organizationId = '10000000-0000-4000-8000-000000000001';
const secret = 'org-a-webhook-secret';
const stableKey = 'product:30000000-0000-4000-8000-000000000001:offer';

function signedRequest(bodyText: string, signingSecret = secret) {
  return new Request('http://test.invalid/api/payments/webhook/mock', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mock-signature': createHmac('sha256', signingSecret).update(bodyText).digest('hex'),
    },
    body: bodyText,
  });
}

function createRouteHarness() {
  const intent = {
    id: '20000000-0000-4000-8000-000000000001',
    organizationId,
    idempotencyKey: stableKey,
    providerId: 'mock',
    appointmentId: null,
    platformUserId: '40000000-0000-4000-8000-000000000001',
    productRef: null,
    amountMinor: 100,
    currency: 'RUB',
    status: 'succeeded',
    purpose: 'product_purchase',
    providerIntentRef: 'persisted-provider-ref',
  };
  const stored: StoredPaymentProviderEvent = {
    inserted: false,
    id: '50000000-0000-4000-8000-000000000001',
    organizationId,
    providerId: 'mock',
    idempotencyKey: stableKey,
    eventType: 'payment.succeeded',
    intentRef: 'persisted-provider-ref',
    payloadJson: { intentId: intent.id, intentRef: 'persisted-provider-ref' },
    processedAt: null,
  };
  const port = {
    resolveProviderWebhookOrganization: vi.fn(
      async (_provider: string, key: string, eventType: string) =>
        key === stableKey && eventType === 'payment.succeeded' ? organizationId : null,
    ),
    recordProviderEvent: vi.fn().mockResolvedValue(stored),
    getProviderEventById: vi.fn().mockResolvedValue(stored),
    findIntentById: vi.fn(async (id: string) => (id === intent.id ? intent : null)),
    findIntentByProviderRef: vi.fn(),
    lockIntentForCapture: vi.fn().mockResolvedValue(intent),
    updateIntentStatus: vi.fn(),
    findPaymentByIntent: vi.fn().mockResolvedValue({
      id: '60000000-0000-4000-8000-000000000001',
      organizationId,
      paymentIntentId: intent.id,
      appointmentId: null,
      amountMinor: 100,
      currency: 'RUB',
      status: 'captured',
      providerId: 'mock',
      purpose: 'product_purchase',
    }),
    hasCapturedHistoryEvent: vi.fn().mockResolvedValue(true),
    appendHistoryEvent: vi.fn(),
    markProviderEventProcessed: vi.fn(),
  };
  const readSetting = vi.fn(async (key: string, requestedOrganizationId?: string) => {
    if (requestedOrganizationId !== organizationId) throw new Error('wrong_org_config_read');
    if (key === 'booking_payment_enabled') return { valueJson: { value: true } };
    return {
      valueJson: {
        value: {
          enabled: true,
          defaultProviderId: 'mock',
          providers: [{ id: 'mock', label: 'mock', enabled: true, webhookSecret: secret }],
        },
      },
    };
  });
  const payments = createPaymentsService({
    port: port as never,
    config: createPaymentsConfigReader(readSetting),
    captureUnitOfWork: {
      run: async <T>(_org: string, fn: () => Promise<T>) => fn(),
      runSerializedPostCommit: async <T>(_org: string, _key: string, fn: () => Promise<T>) => fn(),
    },
    bookingEngine: null,
  });
  const principalOrganizations: string[] = [];
  const runWithOrganization = async <T>(requestedOrganizationId: string, fn: () => Promise<T>) => {
    principalOrganizations.push(requestedOrganizationId);
    return fn();
  };
  const post = createPaymentsWebhookPost({
    buildDeps: () => ({ payments }),
    runWithOrganization,
  });
  return { post, port, readSetting, principalOrganizations };
}

describe('public payment webhook replay authority', () => {
  it('replays the stored event in its exact organization when the signed duplicate body changes', async () => {
    const harness = createRouteHarness();
    const changedBody = JSON.stringify({
      idempotencyKey: stableKey,
      eventType: 'payment.succeeded',
      intentId: '20000000-0000-4000-8000-000000000099',
      intentRef: 'fresh-changed-provider-ref',
    });

    const response = await harness.post(signedRequest(changedBody), {
      params: Promise.resolve({ provider: 'mock' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, duplicate: true });
    expect(harness.principalOrganizations).toEqual([organizationId]);
    expect(harness.readSetting).toHaveBeenCalledWith('booking_payment_providers', organizationId);
    expect(harness.port.findIntentById).not.toHaveBeenCalledWith(
      '20000000-0000-4000-8000-000000000099',
    );
    expect(harness.port.lockIntentForCapture).toHaveBeenCalledWith(
      '20000000-0000-4000-8000-000000000001',
      organizationId,
    );
  });

  it('returns the same non-leaking denial for an unknown authority and a wrong org signature', async () => {
    const unknown = createRouteHarness();
    const unknownBody = JSON.stringify({
      idempotencyKey: 'product:30000000-0000-4000-8000-000000000099:offer',
      eventType: 'payment.succeeded',
    });
    const unknownResponse = await unknown.post(signedRequest(unknownBody), {
      params: Promise.resolve({ provider: 'mock' }),
    });

    const wrongSignature = createRouteHarness();
    const knownBody = JSON.stringify({
      idempotencyKey: stableKey,
      eventType: 'payment.succeeded',
      intentId: '20000000-0000-4000-8000-000000000001',
    });
    const wrongResponse = await wrongSignature.post(signedRequest(knownBody, 'wrong-org-secret'), {
      params: Promise.resolve({ provider: 'mock' }),
    });

    expect(unknownResponse.status).toBe(401);
    expect(wrongResponse.status).toBe(401);
    await expect(unknownResponse.json()).resolves.toEqual({
      ok: false,
      error: 'invalid_webhook_signature',
    });
    await expect(wrongResponse.json()).resolves.toEqual({
      ok: false,
      error: 'invalid_webhook_signature',
    });
    expect(unknown.readSetting).not.toHaveBeenCalled();
    expect(wrongSignature.readSetting).toHaveBeenCalledWith(
      'booking_payment_providers',
      organizationId,
    );
  });

  it('redacts unknown provider and adapter messages behind fixed webhook_failed', async () => {
    const harness = createRouteHarness();
    const response = await harness.post(
      signedRequest(JSON.stringify({ marker: 'patient@example.test SQLSTATE 23505' })),
      { params: Promise.resolve({ provider: 'patient@example.test' }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'webhook_failed' });
    expect(harness.readSetting).not.toHaveBeenCalled();
  });
});

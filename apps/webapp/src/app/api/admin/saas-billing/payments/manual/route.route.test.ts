import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseError } from 'pg';
import {
  PaymentProviderRequestRefusedError,
  PaymentProviderTransportError,
} from '@/modules/payments/providerPort';
import {
  withManualInvoiceDatabaseBoundary,
  withManualInvoiceProviderTransportBoundary,
} from '@/modules/saas-billing/manualInvoiceFailure';

const fakes = vi.hoisted(() => ({
  gate: vi.fn(),
  createManualInvoice: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.gate,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    saasBilling: { createManualSaasBillingInvoice: fakes.createManualInvoice },
  }),
}));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { error: fakes.loggerError },
}));

import { POST } from './route';

const requestBody = {
  organizationId: '00000000-0000-4000-8000-000000000118',
  amountMinor: 5_000,
  currency: 'RUB',
  description: 'Счёт за тариф',
};

function request(body: unknown = requestBody) {
  return new Request('https://app.example.test/api/admin/saas-billing/payments/manual', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.gate.mockResolvedValue({ ok: true, session: { user: { role: 'admin' } } });
});

describe('manual SaaS invoice HTTP mapping', () => {
  it('rejects malformed input before resolving billing dependencies', async () => {
    const response = await POST(request({ ...requestBody, amountMinor: 0 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'invalid_manual_invoice_request',
    });
    expect(fakes.createManualInvoice).not.toHaveBeenCalled();
    expect(fakes.loggerError).not.toHaveBeenCalled();
  });

  it('returns the persisted provider checkout URL on success', async () => {
    const invoice = {
      id: '00000000-0000-4000-8000-000000000219',
      organizationId: requestBody.organizationId,
      providerCheckoutUrl: 'https://pay.example.test/invoice-219',
      status: 'pending',
    };
    fakes.createManualInvoice.mockResolvedValue(invoice);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, invoice });
    expect(fakes.createManualInvoice).toHaveBeenCalledWith(requestBody);
    expect(fakes.loggerError).not.toHaveBeenCalled();
  });

  it('refuses a success-shaped result that has no persisted checkout URL', async () => {
    fakes.createManualInvoice.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000219',
      organizationId: requestBody.organizationId,
      providerCheckoutUrl: null,
      status: 'draft',
    });

    const response = await POST(request());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'saas_billing_checkout_unavailable',
    });
    expect(fakes.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'saas_billing_manual_invoice_failed',
        root: 'provider_invalid_or_unavailable',
      }),
      '[saas-billing/manual-invoice] creation failed',
    );
  });

  it.each([
    ['organization_not_found', undefined, 404, 'organization_not_found'],
    ['saas_billing_no_tariff_assigned', undefined, 409, 'saas_billing_no_tariff_assigned'],
    [
      'saas_billing_receipt_customer_email_missing',
      undefined,
      422,
      'saas_billing_fiscal_data_invalid',
    ],
    [
      'saas_billing_provider_invoices_unsupported:yookassa',
      undefined,
      501,
      'saas_billing_provider_invoices_unsupported',
    ],
    [
      'saas_billing_payment_provider_unavailable:yookassa',
      undefined,
      503,
      'saas_billing_payment_provider_unavailable',
    ],
    ['unexpected internal failure', undefined, 503, 'saas_billing_manual_invoice_unavailable'],
  ])('maps %s to a bounded refusal', async (message, code, status, publicError) => {
    fakes.createManualInvoice.mockRejectedValue(Object.assign(new Error(message), { code }));

    const response = await POST(request());

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ ok: false, error: publicError });
    expect(fakes.loggerError).toHaveBeenCalledOnce();
    expect(fakes.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'saas_billing_manual_invoice_failed',
        errorName: 'Error',
        errorCode: code ?? null,
        root: expect.any(String),
      }),
      '[saas-billing/manual-invoice] creation failed',
    );
  });

  it('preserves a bounded database-unavailable mapping for an actual PostgreSQL error', async () => {
    const rawMessage = 'permission denied: db-customer-secret@example.test';
    const databaseError = new DatabaseError(rawMessage, rawMessage.length, 'error');
    databaseError.code = '42501';
    fakes.createManualInvoice.mockImplementation(() =>
      withManualInvoiceDatabaseBoundary(() => Promise.reject(databaseError)),
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ ok: false, error: 'saas_billing_database_unavailable' });
    expect(JSON.stringify({ body, logs: fakes.loggerError.mock.calls })).not.toContain(rawMessage);
    expect(fakes.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: '42501', root: 'database_unavailable' }),
      '[saas-billing/manual-invoice] creation failed',
    );
  });

  it('preserves a bounded database-unavailable mapping for a transport-shaped connect failure', async () => {
    const rawMessage = 'connect refused: transport-customer-secret@example.test';
    const transportError = new PaymentProviderTransportError('ECONNREFUSED', {
      cause: new Error(rawMessage),
    });
    fakes.createManualInvoice.mockImplementation(() =>
      withManualInvoiceProviderTransportBoundary(() => Promise.reject(transportError)),
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ ok: false, error: 'saas_billing_database_unavailable' });
    expect(JSON.stringify({ body, logs: fakes.loggerError.mock.calls })).not.toContain(rawMessage);
    expect(fakes.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'ECONNREFUSED', root: 'database_unavailable' }),
      '[saas-billing/manual-invoice] creation failed',
    );
  });

  it('maps a typed provider refusal without trusting its message text', async () => {
    const providerResponse = 'provider-fiscal-customer-secret@example.test';
    fakes.createManualInvoice.mockRejectedValue(
      new PaymentProviderRequestRefusedError(
        `yookassa_create_invoice_failed:403:${providerResponse}`,
      ),
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      ok: false,
      error: 'saas_billing_provider_rejected_invoice',
    });
    expect(JSON.stringify({ body, logs: fakes.loggerError.mock.calls })).not.toContain(
      providerResponse,
    );
    expect(fakes.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: null, root: 'provider_invoice_refused' }),
      '[saas-billing/manual-invoice] creation failed',
    );
  });

  it('does not let an untyped domain error forge a provider refusal through message text', async () => {
    fakes.createManualInvoice.mockRejectedValue(
      new Error('yookassa_create_invoice_failed:403:provider refused'),
    );

    const response = await POST(request());

    expect.soft(response.status).toBe(503);
    await expect.soft(response.json()).resolves.toEqual({
      ok: false,
      error: 'saas_billing_manual_invoice_unavailable',
    });
    expect.soft(fakes.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: null, root: 'unclassified' }),
      '[saas-billing/manual-invoice] creation failed',
    );
  });

  it('never puts provider/fiscal response text into the structured root diagnostic', async () => {
    const secretEcho = 'fiscal-customer-secret@example.test';
    fakes.createManualInvoice.mockRejectedValue(
      new Error(`yookassa_create_invoice_failed:403:${secretEcho}`),
    );

    await POST(request());

    expect(JSON.stringify(fakes.loggerError.mock.calls)).not.toContain(secretEcho);
  });

  it('drops arbitrary error codes that could echo provider or customer data', async () => {
    const secretCode = 'customer-secret-code';
    fakes.createManualInvoice.mockRejectedValue(
      Object.assign(new Error('unexpected internal failure'), { code: secretCode }),
    );

    await POST(request());

    expect(JSON.stringify(fakes.loggerError.mock.calls)).not.toContain(secretCode);
    expect(fakes.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: null }),
      '[saas-billing/manual-invoice] creation failed',
    );
  });

  it.each(['PWN42', 'QXZ99', 'provider-secret-code'])(
    'does not expose unknown external code %s in response, structured logs or console logs',
    async (attackerControlledCode) => {
      const rawMessage = `unexpected provider failure: ${attackerControlledCode}:customer-secret`;
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      try {
        fakes.createManualInvoice.mockRejectedValue(
          Object.assign(new Error(rawMessage), { code: attackerControlledCode }),
        );

        const response = await POST(request());
        const body = await response.json();
        const observable = JSON.stringify({
          body,
          structured: fakes.loggerError.mock.calls,
          console: [consoleError.mock.calls, consoleWarn.mock.calls, consoleLog.mock.calls],
        });

        expect(response.status).toBe(503);
        expect(body).toEqual({ ok: false, error: 'saas_billing_manual_invoice_unavailable' });
        expect(observable).not.toContain(attackerControlledCode);
        expect(observable).not.toContain(rawMessage);
        expect(fakes.loggerError).toHaveBeenCalledWith(
          expect.objectContaining({ errorCode: null, root: 'unclassified' }),
          '[saas-billing/manual-invoice] creation failed',
        );
      } finally {
        consoleError.mockRestore();
        consoleWarn.mockRestore();
        consoleLog.mockRestore();
      }
    },
  );

  it.each(['42501', 'ECONNREFUSED'])(
    'does not let a plain external error forge trusted provenance with error.code=%s',
    async (spoofedTrustedCode) => {
      const rawMessage = `provider-controlled:${spoofedTrustedCode}:customer-secret`;
      fakes.createManualInvoice.mockImplementation(() =>
        withManualInvoiceProviderTransportBoundary(() =>
          Promise.reject(Object.assign(new Error(rawMessage), { code: spoofedTrustedCode })),
        ),
      );

      const response = await POST(request());
      const body = await response.json();
      const observable = JSON.stringify({ body, structured: fakes.loggerError.mock.calls });

      expect.soft(response.status).toBe(503);
      expect.soft(body).toEqual({ ok: false, error: 'saas_billing_manual_invoice_unavailable' });
      expect.soft(observable).not.toContain(spoofedTrustedCode);
      expect.soft(observable).not.toContain(rawMessage);
      expect.soft(fakes.loggerError).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: null, root: 'unclassified' }),
        '[saas-billing/manual-invoice] creation failed',
      );
    },
  );
});
